import React, { useState } from 'react';
import { FLAVORS } from '../data/flavors';
import { audioManager } from '../audio/audioManager';
import { getProductBySlug, formatPrice } from '../data/products';
import { useCart } from '../store/cart';
import { InfoDrawer } from './InfoDrawer';
import { ButtonLabel } from './ButtonLabel';

interface FlavorFinderProps {
  isOpen: boolean;
  onClose: () => void;
  /** Spins the hero carousel to the recommended flavor. */
  onRecommend: (index: number) => void;
}

const QUESTIONS = [
  {
    id: 'taste',
    question: 'Which taste pulls you in?',
    options: [
      { label: 'Berry and bold', scores: { 'blue-raspberry': 2, 'blackout-berry': 2 } },
      { label: 'Tropical and sweet', scores: { 'mango-fuego': 2, peach: 1 } },
      { label: 'Fresh and juicy', scores: { watermelon: 2, 'strawberry-kiwi': 2 } },
      { label: 'Soft and fruity', scores: { peach: 2, 'strawberry-kiwi': 1 } },
    ],
  },
  {
    id: 'mood',
    question: 'What’s the mood?',
    options: [
      { label: 'Focused', scores: { 'blue-raspberry': 1, peach: 1 } },
      { label: 'Fired up', scores: { 'mango-fuego': 2, 'blackout-berry': 1 } },
      { label: 'Chilled', scores: { watermelon: 1, peach: 1 } },
      { label: 'Adventurous', scores: { 'blackout-berry': 2, 'falsa-frost': 2, 'strawberry-kiwi': 1 } },
    ],
  },
  {
    id: 'time',
    question: 'When do you need it?',
    options: [
      { label: 'Morning', scores: { peach: 1, 'blue-raspberry': 1 } },
      { label: 'Afternoon', scores: { watermelon: 1, 'strawberry-kiwi': 1 } },
      { label: 'Training', scores: { 'mango-fuego': 1, 'blue-raspberry': 1 } },
      { label: 'Late night', scores: { 'blackout-berry': 1, 'cold-coffee': 2, 'mango-fuego': 1 } },
    ],
  },
] as const;

/**
 * Three questions (taste, mood, time of day) → a recommended flavor. Ends by
 * spinning the hero carousel to it and offering Add to bag. Scoring is a simple,
 * transparent mapping from the flavor descriptions, not a claim.
 */
export const FlavorFinder: React.FC<FlavorFinderProps> = ({ isOpen, onClose, onRecommend }) => {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [added, setAdded] = useState(false);
  const { addItem, toggleCart } = useCart();

  const reset = () => {
    setStep(0);
    setAnswers([]);
    setAdded(false);
  };

  const choose = (optionIndex: number) => {
    const next = [...answers.slice(0, step), optionIndex];
    setAnswers(next);
    if (step < QUESTIONS.length - 1) {
      setStep(step + 1);
      return;
    }
    setStep(QUESTIONS.length);
    onRecommend(recommend(next));
  };

  const result = step === QUESTIONS.length ? FLAVORS[recommend(answers)] : null;
  const product = result ? getProductBySlug(result.id) : undefined;

  return (
    <InfoDrawer
      isOpen={isOpen}
      onClose={() => {
        onClose();
        reset();
      }}
      title="Find your flavor"
    >
      {result && product ? (
        <div className="finder__result" data-accent={product.accentToken}>
          <p className="finder__eyebrow">Your match</p>
          <p className="finder__flavor display">{product.name}</p>
          <p className="finder__text">{product.tagline}</p>
          <button
            type="button"
            className={`button-primary button-primary--block ${added ? 'is-success' : ''}`}
            onClick={() => {
              const outcome = addItem(product, 'pack-6', 1);
              if (outcome.ok) {
                setAdded(true);
                audioManager.play('open');
                toggleCart(true);
              }
            }}
          >
            <ButtonLabel>{added ? 'Added to bag' : `Add 6 cans, ${formatPrice(product.packOptions[1].price)}`}</ButtonLabel>
          </button>
          <button type="button" className="text-button finder__again" onClick={reset}>Start again</button>
        </div>
      ) : (
        <fieldset className="finder__step">
          <legend className="finder__question">
            <span className="finder__count">Question {step + 1} of {QUESTIONS.length}</span>
            {QUESTIONS[step].question}
          </legend>
          <div className="finder__options">
            {QUESTIONS[step].options.map((option, index) => (
              <button key={option.label} type="button" className={`chip finder__option ${answers[step] === index ? 'is-selected' : ''}`} onClick={() => choose(index)}>
                {option.label}
              </button>
            ))}
          </div>
          {step > 0 && (
            <button type="button" className="text-button" onClick={() => setStep(step - 1)}>Back</button>
          )}
        </fieldset>
      )}
    </InfoDrawer>
  );
};

function recommend(answers: number[]): number {
  const totals: Record<string, number> = {};
  answers.forEach((answer, index) => {
    const scores = QUESTIONS[index].options[answer]?.scores ?? {};
    Object.entries(scores).forEach(([slug, score]) => {
      totals[slug] = (totals[slug] ?? 0) + score;
    });
  });
  let best = 0;
  let bestScore = -1;
  FLAVORS.forEach((flavor, index) => {
    const score = totals[flavor.id] ?? 0;
    if (score > bestScore) {
      best = index;
      bestScore = score;
    }
  });
  return best;
}
