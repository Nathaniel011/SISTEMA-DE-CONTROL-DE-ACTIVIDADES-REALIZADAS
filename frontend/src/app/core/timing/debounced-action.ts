import {DestroyRef, inject} from '@angular/core';

export function debouncedAction(delay: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  function cancel(): void {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  }
  inject(DestroyRef).onDestroy(cancel);
  return {
    cancel,
    schedule(action: () => void): void {
      cancel();
      timer = setTimeout(() => {
        timer = undefined;
        action();
      }, delay);
    },
  };
}
