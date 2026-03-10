import React, { memo, forwardRef } from "react";

interface ListProps {
  items: string[];
  onSelect: (item: string) => void;
}

/** A memoized list component */
export const MemoizedList = memo(function MemoizedList({ items, onSelect }: ListProps) {
  return (
    <ul>
      {items.map((item) => (
        <li key={item} onClick={() => onSelect(item)}>
          {item}
        </li>
      ))}
    </ul>
  );
});

interface InputProps {
  placeholder?: string;
}

/** A forwarded-ref input component */
export const ForwardedInput = forwardRef<HTMLInputElement, InputProps>(
  function ForwardedInput({ placeholder }, ref) {
    return <input ref={ref} placeholder={placeholder} />;
  }
);
