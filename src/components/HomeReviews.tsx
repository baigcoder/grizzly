import React from 'react';
import { REVIEWS } from '../data/brand';

/**
 * "What people say" on the home page, before the FAQ: up to three quotes from grizzly.json `reviews`, the average
 * rating above them. Renders nothing until real reviews are supplied (never placeholder quotes). Not a home-section,
 * so the scroll story, the paging and the 3D timeline are untouched.
 */
export const HomeReviews: React.FC = () => {
  if (REVIEWS.length === 0) return null;
  const average = REVIEWS.reduce((sum, review) => sum + review.rating, 0) / REVIEWS.length;
  return (
    <section className="home-reviews" aria-labelledby="home-reviews-title">
      <p className="home-reviews__score" aria-label={`Rated ${average.toFixed(1)} out of 5 from ${REVIEWS.length} reviews`}>
        <span aria-hidden="true">{'★'.repeat(Math.round(average))}</span> {average.toFixed(1)} · {REVIEWS.length} reviews
      </p>
      <h2 id="home-reviews-title" className="display home-reviews__title">What people say</h2>
      <ul className="home-reviews__list">
        {REVIEWS.slice(0, 3).map((review) => (
          <li key={review.author} className="home-reviews__item">
            <p className="home-reviews__stars" aria-label={`${review.rating} out of 5`}>{'★'.repeat(review.rating)}</p>
            <blockquote className="home-reviews__quote">{review.text}</blockquote>
            <p className="home-reviews__author">{review.author}</p>
          </li>
        ))}
      </ul>
    </section>
  );
};
