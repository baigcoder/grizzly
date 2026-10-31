import React, { useEffect, useId, useRef, useState } from 'react';
import { COMMERCE } from '../data/brand';
import { PLACEHOLDER_PRICING, PRODUCTS, formatPrice, getProductThumbUrl } from '../data/products';
import { useCart } from '../store/cart';
import { CartContents } from './CartContents';
import { ButtonLabel } from './ButtonLabel';

interface CheckoutPageProps {
  onNavigate: (url: string) => void;
}

type Field = 'name' | 'phone' | 'email' | 'address' | 'city' | 'province';
type Values = Record<Field | 'postcode' | 'notes' | 'payment', string>;

const PHONE_PK = /^(\+92|0092|0)?3\d{2}[\s-]?\d{7}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const LABELS: Record<Field, string> = {
  name: 'Full name',
  phone: 'Mobile number',
  email: 'Email',
  address: 'Street address',
  city: 'City',
  province: 'Province or territory',
};

function validate(values: Values): Partial<Record<Field, string>> {
  const errors: Partial<Record<Field, string>> = {};
  if (values.name.trim().length < 2) errors.name = 'Enter your full name.';
  if (!PHONE_PK.test(values.phone.trim())) errors.phone = 'Enter a Pakistani mobile number, like 0300 1234567.';
  if (values.email.trim() && !EMAIL.test(values.email.trim())) errors.email = 'Enter an email like name@example.com, or leave it empty.';
  if (values.address.trim().length < 5) errors.address = 'Enter your street address.';
  if (values.city.trim().length < 2) errors.city = 'Enter your city.';
  if (!values.province) errors.province = 'Choose your province or territory.';
  return errors;
}

/**
 * Checkout: contact, address, delivery and payment (cash on delivery). No order
 * backend or payment provider is connected; the confirmation says so plainly.
 */
export const CheckoutPage: React.FC<CheckoutPageProps> = ({ onNavigate }) => {
  const { items, totals, clearCart } = useCart();
  const [values, setValues] = useState<Values>({ name: '', phone: '', email: '', address: '', city: '', province: '', postcode: '', notes: '', payment: 'cod' });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [status, setStatus] = useState<'editing' | 'submitting' | 'confirmed'>('editing');
  /** Everything the confirmation shows is captured at submit, before the bag is cleared. */
  const [confirmation, setConfirmation] = useState<{
    reference: string;
    name: string;
    total: number;
    lines: Array<{ id: string; label: string; quantity: number; amount: number }>;
    totals: { subtotal: number; discount: number; delivery: number; total: number };
    details: Array<[string, string]>;
  } | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (status === 'confirmed') confirmRef.current?.focus();
  }, [status]);
  const formId = useId();

  const set = (field: keyof Values) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setValues((previous) => ({ ...previous, [field]: event.target.value }));
    if (field in errors) setErrors((previous) => ({ ...previous, [field]: undefined }));
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const found = validate(values);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      requestAnimationFrame(() => summaryRef.current?.focus());
      return;
    }
    setStatus('submitting');
    window.setTimeout(() => {
      const address = [values.address.trim(), values.city.trim(), values.province, values.postcode.trim()].filter(Boolean).join(', ');
      setConfirmation({
        reference: `GE-${Date.now().toString(36).toUpperCase().slice(-6)}`,
        name: values.name.trim().split(' ')[0],
        total: totals.total,
        lines: items.map((item) => ({ id: item.id, label: `${item.productName}, ${item.packLabel}`, quantity: item.quantity, amount: item.price * item.quantity })),
        totals: { subtotal: totals.subtotal, discount: totals.discount, delivery: totals.delivery, total: totals.total },
        details: [
          ['Name', values.name.trim()],
          ['Mobile', values.phone.trim()],
          ['Deliver to', address],
          ['Payment', 'Cash on delivery'],
        ],
      });
      clearCart();
      setStatus('confirmed');
      window.scrollTo({ top: 0 });
    }, 700);
  };

  if (status === 'confirmed' && confirmation) {
    return (
      <section className="checkout checkout--done" aria-labelledby="confirm-title">
        <h1 id="confirm-title" ref={confirmRef} className="display checkout__title" tabIndex={-1}>Thank you, {confirmation.name}</h1>
        <p className="checkout__notice checkout__notice--strong" role="note">
          <strong>No order was sent.</strong> This is a preview store: nothing was placed with a delivery service, nothing was charged and
          nothing will be delivered. Online ordering opens soon.
        </p>
        <p className="checkout__lead">
          Your order details are ready. Reference <strong>{confirmation.reference}</strong>, total {formatPrice(confirmation.total)}, cash on delivery.
        </p>

        <div className="receipt">
          <h2 className="receipt__title">Order summary</h2>
          <ul className="receipt__lines">
            {confirmation.lines.map((line) => (
              <li key={line.id}>
                <span>{line.quantity} × {line.label}</span>
                <span>{formatPrice(line.amount)}</span>
              </li>
            ))}
          </ul>
          <dl className="receipt__totals">
            <div><dt>Subtotal</dt><dd>{formatPrice(confirmation.totals.subtotal)}</dd></div>
            {confirmation.totals.discount > 0 && <div><dt>Discount</dt><dd>−{formatPrice(confirmation.totals.discount)}</dd></div>}
            <div><dt>Delivery</dt><dd>{confirmation.totals.delivery === 0 ? 'Free' : formatPrice(confirmation.totals.delivery)}</dd></div>
            <div className="receipt__grand"><dt>Total</dt><dd>{formatPrice(confirmation.totals.total)}</dd></div>
          </dl>
          {PLACEHOLDER_PRICING && <p className="receipt__note">Prices are placeholders until the real price list is confirmed.</p>}
          <h2 className="receipt__title">Your details</h2>
          <dl className="receipt__details">
            {confirmation.details.map(([label, value]) => (
              <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
            ))}
          </dl>
        </div>

        <a className="button-primary" href="/" onClick={(event) => { event.preventDefault(); onNavigate('/'); }}>
          <ButtonLabel>Back to the range</ButtonLabel>
        </a>
      </section>
    );
  }

  if (items.length === 0) {
    return (
      <section className="checkout" aria-labelledby="checkout-title">
        <h1 id="checkout-title" className="display checkout__title">Checkout</h1>
        <p className="checkout__lead">Your bag is empty. Pick a flavor to get started.</p>
        {/* the range, fanned out: each can opens its flavor */}
        <ul className="bag__empty-cans checkout__cans">
          {PRODUCTS.map((product, index) => (
            <li key={product.slug} style={{ '--i': index - (PRODUCTS.length - 1) / 2 } as React.CSSProperties}>
              <a
                href={`/products/${product.slug}`}
                aria-label={product.name}
                onClick={(event) => {
                  event.preventDefault();
                  onNavigate(`/products/${product.slug}`);
                }}
              >
                <img src={getProductThumbUrl(product)} alt="" width={187} height={491} loading="lazy" decoding="async" />
              </a>
            </li>
          ))}
        </ul>
        <a className="button-primary" href="/shop" onClick={(event) => { event.preventDefault(); onNavigate('/shop'); }}>
          <ButtonLabel>Shop the range</ButtonLabel>
        </a>
        <ul className="checkout__trust">
          <li>Cash on delivery</li>
          <li>Halal certified</li>
          <li>Made in Pakistan</li>
        </ul>
      </section>
    );
  }

  const errorList = (Object.keys(errors) as Field[]).filter((field) => errors[field]);
  const field = (name: Field, input: React.ReactNode, hint?: string) => (
    <div className={`field field--stacked ${errors[name] ? 'is-invalid' : ''}`}>
      <label htmlFor={`${formId}-${name}`} className="field-legend">{LABELS[name]}{name === 'email' && ' (optional)'}</label>
      {input}
      {hint && <p className="field__hint" id={`${formId}-${name}-hint`}>{hint}</p>}
      {errors[name] && <p className="field__error" id={`${formId}-${name}-error`}>{errors[name]}</p>}
    </div>
  );
  const describedBy = (name: Field, hasHint = false) =>
    [hasHint ? `${formId}-${name}-hint` : '', errors[name] ? `${formId}-${name}-error` : ''].filter(Boolean).join(' ') || undefined;

  return (
    <section className="checkout" aria-labelledby="checkout-title">
      <h1 id="checkout-title" className="display checkout__title">Checkout</h1>

      <div className="checkout__layout">
        <form className="checkout__form" onSubmit={submit} noValidate>
          {errorList.length > 0 && (
            <div ref={summaryRef} className="checkout__errors" role="alert" tabIndex={-1}>
              <p>Fix {errorList.length === 1 ? 'this' : `these ${errorList.length}`} to continue:</p>
              <ul>
                {errorList.map((name) => (
                  <li key={name}><a href={`#${formId}-${name}`}>{errors[name]}</a></li>
                ))}
              </ul>
            </div>
          )}

          <fieldset className="checkout__group">
            <legend className="checkout__legend">Contact</legend>
            {field('name', <input id={`${formId}-name`} className="field__input field__input--plain" autoComplete="name" value={values.name} onChange={set('name')} aria-invalid={!!errors.name} aria-describedby={describedBy('name')} />)}
            {field('phone', <input id={`${formId}-phone`} className="field__input field__input--plain" type="tel" inputMode="tel" autoComplete="tel" value={values.phone} onChange={set('phone')} aria-invalid={!!errors.phone} aria-describedby={describedBy('phone', true)} />, 'For delivery updates and the cash-on-delivery call.')}
            {field('email', <input id={`${formId}-email`} className="field__input field__input--plain" type="email" autoComplete="email" value={values.email} onChange={set('email')} aria-invalid={!!errors.email} aria-describedby={describedBy('email')} />)}
          </fieldset>

          <fieldset className="checkout__group">
            <legend className="checkout__legend">Delivery address</legend>
            {field('address', <input id={`${formId}-address`} className="field__input field__input--plain" autoComplete="street-address" value={values.address} onChange={set('address')} aria-invalid={!!errors.address} aria-describedby={describedBy('address')} />)}
            <div className="checkout__pair">
              {field('city', <input id={`${formId}-city`} className="field__input field__input--plain" autoComplete="address-level2" value={values.city} onChange={set('city')} aria-invalid={!!errors.city} aria-describedby={describedBy('city')} />)}
              {field('province', (
                <select id={`${formId}-province`} className="field__input field__input--plain" autoComplete="address-level1" value={values.province} onChange={set('province')} aria-invalid={!!errors.province} aria-describedby={describedBy('province')}>
                  <option value="">Choose…</option>
                  {COMMERCE.provinces.map((province) => <option key={province} value={province}>{province}</option>)}
                </select>
              ))}
            </div>
            <div className="field field--stacked">
              <label htmlFor={`${formId}-notes`} className="field-legend">Delivery notes (optional)</label>
              <textarea id={`${formId}-notes`} className="field__input field__input--plain field__input--area" rows={3} value={values.notes} onChange={set('notes')} />
            </div>
          </fieldset>

          <fieldset className="checkout__group">
            <legend className="checkout__legend">Payment</legend>
            {COMMERCE.paymentMethods.map((method) => (
              <label key={method.id} className={`pay-option ${values.payment === method.id ? 'is-selected' : ''} ${method.available ? '' : 'is-disabled'}`}>
                <input type="radio" name="payment" value={method.id} checked={values.payment === method.id} disabled={!method.available} onChange={set('payment')} aria-describedby={`${formId}-pay-${method.id}`} />
                <span className="pay-option__label">{method.label}</span>
                <span className="pay-option__note" id={`${formId}-pay-${method.id}`}>{method.available ? 'Pay in cash when your order arrives (Pakistan only).' : ('note' in method ? method.note : '')}</span>
              </label>
            ))}
          </fieldset>

          <button type="submit" className="button-primary button-primary--block" disabled={status === 'submitting'} aria-busy={status === 'submitting'}>
            <ButtonLabel>{status === 'submitting' ? 'Placing order…' : 'Place order'}</ButtonLabel>
          </button>
          <p className="checkout__fine">Delivery areas and times are being finalised.</p>
        </form>

        <aside className="checkout__summary" aria-label="Order summary">
          <CartContents headingId="checkout-summary-title" onNavigate={onNavigate} readOnly />
        </aside>
      </div>
    </section>
  );
};
