import { forwardRef } from 'react';
import { PlateContent } from 'platejs/react';

export const BardoEditorSurface = forwardRef(function BardoEditorSurface({ onFocus, onBlur, ...props }, ref) {
  return (
    <PlateContent
      ref={ref}
      className="doc-body editable-body outline-none"
      role="textbox"
      aria-multiline="true"
      placeholder="Escribe aquí. Usa / para insertar títulos, listas o tablas…"
      onFocus={onFocus}
      onBlur={onBlur}
      {...props}
    />
  );
});
