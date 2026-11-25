const INTERACTIVE = 'a,button,input,select,textarea,label,[role="menuitem"],[role="combobox"],[data-slot="table-actions"]';

export const rowLinkClass = 'rounded-xs text-inherit no-underline underline-offset-4 outline-hidden hover:underline in-[tr:hover]:underline focus-visible:underline focus-visible:ring-3 focus-visible:ring-ring/50';

export const rowButtonClass = `${rowLinkClass} cursor-pointer text-left`;

export const activateRow = (event: Event, action: () => void): void => {
  const target = event.target;
  if (target instanceof Element && target.closest(INTERACTIVE) !== null) return;
  action();
};
