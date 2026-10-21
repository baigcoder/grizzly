import { expect, test, type Page } from '@playwright/test';

async function waitForLoader(page: Page) {
  await expect(page.getByRole('progressbar', { name: 'Loading Grizzly Energy' })).toBeHidden({ timeout: 30_000 });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    window.localStorage.clear();
    window.localStorage.setItem('grizzly_notice_v1', '1');
  });
});

test('hero link opens the product page for the selected flavor', async ({ page }) => {
  await page.goto('/');
  await waitForLoader(page);
  await page.locator('#profile').getByRole('link', { name: 'View details and order Blue Raspberry' }).click();
  await expect(page).toHaveURL(/\/products\/blue-raspberry$/);
  await expect(page.getByRole('heading', { level: 1, name: 'BLUE RASPBERRY' })).toBeVisible();
  await expect(page.getByText('Placeholder price')).toBeVisible();
});

test('add to bag, change quantity, undo a removal, apply a promo', async ({ page }) => {
  await page.goto('/products/peach');
  await waitForLoader(page);

  await page.getByRole('radio', { name: /12 cans/ }).check({ force: true });
  await page.getByRole('button', { name: /Increase quantity of Peach, 12 cans/ }).click();
  await page.getByRole('button', { name: 'Add to bag' }).click();
  await expect(page.getByRole('button', { name: 'Bag, 2 items' })).toBeVisible();

  await page.getByRole('button', { name: 'Bag, 2 items' }).click();
  const bag = page.getByRole('dialog', { name: /Your bag/ });
  await expect(bag.getByText('Rs 5,400').first()).toBeVisible();

  // Quantity change updates the line and the total.
  await bag.getByRole('button', { name: /Increase quantity of Peach, 12 cans/ }).click();
  await expect(bag.getByText('Rs 8,100').first()).toBeVisible();

  // Promo: error, then success.
  await bag.getByLabel('Promo code').fill('NOPE');
  await bag.getByRole('button', { name: 'Apply' }).click();
  await expect(bag.getByText('That code isn’t valid')).toBeVisible();
  await bag.getByLabel('Promo code').fill('wild10');
  await bag.getByRole('button', { name: 'Apply' }).click();
  await expect(bag.getByText('Discount')).toBeVisible();

  // Remove, then undo.
  await bag.getByRole('button', { name: 'Remove Peach, 12 cans' }).click();
  await expect(bag.getByText('Your bag is empty.')).toBeVisible();
  await bag.getByRole('button', { name: 'Undo' }).click();
  await expect(bag.getByText('Rs 8,100').first()).toBeVisible();

  // Persists across reloads (re-priced from the catalog).
  await page.keyboard.press('Escape');
  await page.reload();
  await waitForLoader(page);
  await expect(page.getByRole('button', { name: 'Bag, 3 items' })).toBeVisible();
});

test('checkout validates, then reaches the confirmation screen', async ({ page }) => {
  await page.goto('/products/watermelon');
  await waitForLoader(page);
  await page.getByRole('button', { name: 'Add to bag' }).click();
  await expect(page.getByRole('button', { name: 'Bag, 1 item' })).toBeVisible();

  await page.goto('/checkout');
  await waitForLoader(page);
  await expect(page.getByRole('heading', { name: 'Checkout' })).toBeVisible();
  await expect(page.getByRole('radio', { name: /Cash on delivery/ })).toBeChecked();

  await page.getByRole('button', { name: 'Place order' }).click();
  await expect(page.getByRole('alert')).toContainText('Fix these');

  await page.getByLabel('Full name').fill('Ayesha Khan');
  await page.getByLabel('Mobile number').fill('0300 1234567');
  await page.getByLabel('Street address').fill('12 Canal View Road');
  await page.getByLabel('City', { exact: true }).fill('Lahore');
  await page.getByLabel('Province or territory').selectOption('Punjab');
  await page.getByRole('button', { name: 'Place order' }).click();

  await expect(page.getByRole('heading', { name: 'Thank you, Ayesha' })).toBeVisible();
  await expect(page.getByText('No order was sent.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Bag, empty' })).toBeVisible();
});

test('tampered storage cannot change prices', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() =>
    window.localStorage.setItem(
      'grizzly_cart_v2',
      JSON.stringify([
        { productSlug: 'blue-raspberry', packOptionId: 'single', quantity: 2, price: 1 },
        { productSlug: 'not-a-flavor', packOptionId: 'single', quantity: 1 },
      ])
    )
  );
  await page.goto('/cart');
  await waitForLoader(page);
  await expect(page.getByRole('link', { name: 'Blue Raspberry' })).toBeVisible();
  await expect(page.getByText('Rs 500').first()).toBeVisible();
  await expect(page.getByText('not-a-flavor')).toHaveCount(0);
});

test('unknown pages show the styled 404', async ({ page }) => {
  await page.goto('/this-does-not-exist');
  await waitForLoader(page);
  await expect(page.getByRole('heading', { name: 'Lost in the wild' })).toBeVisible();
  await page.goto('/products/mystery-flavor');
  await waitForLoader(page);
  await expect(page.getByRole('heading', { name: 'Flavor not found' })).toBeVisible();
});

test('save for later moves a line out of the bag and back', async ({ page }) => {
  await page.goto('/products/mango-fuego');
  await waitForLoader(page);
  await page.getByRole('button', { name: 'Add to bag' }).click();
  await page.getByRole('button', { name: /^Bag, 1 item/ }).click();
  const bag = page.getByRole('dialog', { name: /Your bag/ });
  await bag.getByRole('button', { name: /Save Mango Fuego, 6 cans for later/ }).click();
  await expect(bag.getByText('Your bag is empty.')).toBeVisible();
  await expect(bag.getByRole('heading', { name: 'Saved for later (1)' })).toBeVisible();
  await bag.getByRole('button', { name: /Move Mango Fuego, 6 cans to bag/ }).click();
  await expect(bag.getByRole('heading', { name: /Saved for later/ })).toBeHidden();
  // The header sits behind the open dialog (inert), so check the bag itself.
  await expect(bag.getByRole('link', { name: 'Mango Fuego' })).toBeVisible();
  await expect(bag.getByRole('heading', { name: /Your bag \(1\)/ })).toBeVisible();
});

test('store page shows the coming-soon state while no stores are confirmed', async ({ page }) => {
  await page.goto('/stores');
  await waitForLoader(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Find Grizzly' })).toBeVisible();
  await expect(page.getByText('Store list coming soon')).toBeVisible();
  await expect(page.getByLabel('City or shop name')).toBeDisabled();
});

test('limited edition shows its badge but no countdown until the end date is confirmed', async ({ page }) => {
  await page.goto('/products/blackout-berry');
  await waitForLoader(page);
  await expect(page.getByText('Limited edition', { exact: true })).toBeVisible();
  await expect(page.locator('.countdown')).toHaveCount(0);
  await page.goto('/products/peach');
  await waitForLoader(page);
  await expect(page.getByText('Limited edition', { exact: true })).toBeHidden();
});

test('storage notice appears once and stays dismissed', async ({ page }) => {
  await page.evaluate(() => window.localStorage.removeItem('grizzly_notice_v1'));
  await page.goto('/halal-zamzam');
  await waitForLoader(page);
  const notice = page.getByRole('complementary', { name: 'Storage notice' });
  await expect(notice).toBeVisible();
  await notice.getByRole('button', { name: 'Got it' }).click();
  await expect(notice).toBeHidden();
  await page.reload();
  await waitForLoader(page);
  await expect(notice).toBeHidden();
});
