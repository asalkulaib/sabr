// What a meal is: one of four quick choices, or a name typed under Other.
// The choice is stored as the meal's name, so older meals typed as
// "Dinner" read as Dinner, and exports stay as they were. Pure functions only.

export const MEAL_TYPES = ['Snack', 'Breakfast', 'Lunch', 'Dinner'];

/**
 * The likely meal for a start time, in minutes since midnight: breakfast
 * from 05:00, lunch from 11:00, dinner from 16:00, and a snack from 22:00
 * through the night.
 */
export function guessMealType(minutes) {
  if (minutes >= 5 * 60 && minutes < 11 * 60) return 'Breakfast';
  if (minutes >= 11 * 60 && minutes < 16 * 60) return 'Lunch';
  if (minutes >= 16 * 60 && minutes < 22 * 60) return 'Dinner';
  return 'Snack';
}

/** A stored name as a choice: one of the four, 'other' for any other name, null when unnamed. */
export function typeOfName(name) {
  const text = (name || '').trim();
  if (!text) return null;
  return MEAL_TYPES.find((t) => t.toLowerCase() === text.toLowerCase()) || 'other';
}
