import { useState } from 'react';
import type { TextInputKeyPressEvent } from 'react-native';

/**
 * Arrow-key highlighting for a result list under a text field. The highlight resets whenever the list
 * changes, so Enter never picks a row the user has not seen. Enter itself stays on `onSubmitEditing`
 * (call `pickActive` there), because the field fires both for the same key press.
 */
export function useListNavigation<T>({
  items,
  getKey,
  onPick,
  onClose,
}: {
  items: T[];
  getKey: (item: T) => string;
  onPick: (item: T) => void;
  onClose?: () => void;
}) {
  const listKey = items.map(getKey).join('\n');
  const [state, setState] = useState({ listKey, index: -1 });
  const active = state.listKey === listKey ? state.index : -1;
  const count = items.length;

  const setActive = (index: number) => setState({ listKey, index });

  const onKeyPress = (e: TextInputKeyPressEvent) => {
    const key = e.nativeEvent.key;
    if ((key === 'ArrowDown' || key === 'ArrowUp') && count > 0) {
      e.preventDefault();
      const step = key === 'ArrowDown' ? 1 : -1;
      const from = active === -1 && step === -1 ? 0 : active;
      setActive((from + step + count) % count);
    } else if (key === 'Escape') {
      setActive(-1);
      onClose?.();
    }
  };

  /** Picks the highlighted row. Returns false when nothing is highlighted, so the caller can fall back. */
  const pickActive = () => {
    const item = active >= 0 ? items[active] : undefined;
    if (item === undefined) return false;
    onPick(item);
    return true;
  };

  return { active, setActive, onKeyPress, pickActive };
}
