import { forwardRef } from 'react';
import { PlateContent } from 'platejs/react';

export const BardoEditorSurface = forwardRef(function BardoEditorSurface({ onFocus, onBlur, ...props }, ref) {
  return (
    <PlateContent
      ref={ref}
      className="doc-body editable-body outline-none"
      role="textbox"
      aria-multiline="true"
      data-placeholder="Empieza a escribir…"
      onFocus={onFocus}
      onBlur={onBlur}
      {...props}
    />
  );
});
