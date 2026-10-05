import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('../api.js', () => {
  class NetworkError extends Error {}
  return { NetworkError, saveDish: vi.fn(), fetchDishes: vi.fn() };
});

import { saveDish } from '../api.js';
import DishCard from '../components/DishCard.jsx';

const dish = { dishId: '3', dishName: 'Rabdi', imageUrl: 'https://example.com/rabdi.jpg', isPublished: true, version: 1 };

function renderCard() {
  render(<DishCard dish={dish} onServerDish={vi.fn()} onDirtyChange={vi.fn()} />);
  return screen.getByLabelText('Name');
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('DishCard', () => {
  test('shows unsaved state and the saved value while editing', () => {
    const input = renderCard();
    fireEvent.change(input, { target: { value: 'Rabdi Special' } });
    expect(screen.getByText('Unsaved changes')).toBeTruthy();
    expect(screen.getByText('Saved value: “Rabdi”')).toBeTruthy();
    expect(saveDish).not.toHaveBeenCalled();
  });

  test('warns before saving a published dish without a name', () => {
    const input = renderCard();
    fireEvent.change(input, { target: { value: '  ' } });
    expect(screen.getByText(/A published dish needs a name/)).toBeTruthy();
  });

  test('conflict: reload asks inline first and "Keep my draft" keeps it', async () => {
    saveDish.mockResolvedValue({
      ok: false, status: 409,
      data: { current: { ...dish, dishName: 'Rabdi from tab A', version: 2 } },
    });
    const input = renderCard();
    fireEvent.change(input, { target: { value: 'Rabdi from tab B' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })); });

    expect(screen.getByText(/Not saved: this dish was changed by another update/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save' }).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /Reload latest/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep my draft' }));
    expect(input.value).toBe('Rabdi from tab B');

    fireEvent.click(screen.getByRole('button', { name: /Reload latest/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, discard and reload' }));
    expect(input.value).toBe('Rabdi from tab A');
    expect(screen.queryByText('Unsaved changes')).toBeNull();
  });
});
