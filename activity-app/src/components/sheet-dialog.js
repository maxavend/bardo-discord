// Diálogo alto: en escritorio, centrado un poco más abajo para no quedar bajo
// el header fijo; en móvil, hoja inferior. Se usa con <DialogContent
// scrollable={false}> y un <OverlayScrollArea> propio.
// En móvil la hoja sube desde abajo (sin zoom), como una hoja nativa.
export const SHEET_DIALOG_CLASS = 'sm:top-[calc(50%+1.75rem)] max-sm:top-auto max-sm:bottom-0 max-sm:translate-y-0 max-sm:max-w-full max-sm:rounded-b-none max-sm:duration-200 max-sm:data-open:zoom-in-100 max-sm:data-open:slide-in-from-bottom-10 max-sm:data-closed:zoom-out-100 max-sm:data-closed:slide-out-to-bottom-10';
export const SHEET_DIALOG_SCROLL_CLASS = 'max-h-[calc(100dvh-9rem)] max-sm:max-h-[calc(88dvh-3rem)]';
