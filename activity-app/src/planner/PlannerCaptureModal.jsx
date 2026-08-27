import {useState, useEffect} from 'react';
import {
  Button,
  Modal,
  TextField,
  Label,
  Input,
  TextArea,
  Select,
  ListBox,
} from '@heroui/react';

export function PlannerCaptureModal({
  isOpen,
  onClose,
  onSubmit,
  kind = 'decision',
  initialBlockId = null,
  blocks = [],
}) {
  const [content, setContent] = useState('');
  const [assignee, setAssignee] = useState('@Max Avendaño');
  const [selectedBlockId, setSelectedBlockId] = useState(() => initialBlockId || blocks[0]?.id || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setContent('');
      setSelectedBlockId(initialBlockId || blocks[0]?.id || '');
      setIsSubmitting(false);
    }
  }, [isOpen, initialBlockId, blocks]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!content.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      onSubmit({
        kind,
        blockId: selectedBlockId || blocks[0]?.id,
        content: content.trim(),
        assignee: kind === 'task' ? assignee.trim() : undefined,
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const isDecision = kind === 'decision';

  return (
    <Modal isOpen={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Modal.Backdrop />
      <Modal.Container>
        <Modal.Dialog className="max-w-md w-full p-5 bg-surface border border-border rounded-2xl shadow-xl">
          <Modal.Header className="flex items-center justify-between pb-3 border-b border-border">
            <Modal.Heading className="text-base font-semibold text-foreground flex items-center gap-2">
              <span>{isDecision ? '🟢' : '🟣'}</span>
              <span>{isDecision ? 'Registrar Decisión' : 'Asignar Tarea'}</span>
            </Modal.Heading>
            <Modal.CloseTrigger />
          </Modal.Header>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3.5 mt-3.5">
            {blocks.length > 0 && (
              <Select
                fullWidth
                value={selectedBlockId || blocks[0]?.id}
                onChange={(key) => setSelectedBlockId(String(key))}
                variant="secondary"
              >
                <Label className="text-xs font-semibold text-muted uppercase tracking-wider">
                  Bloque Asociado
                </Label>
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    {blocks.map((b, idx) => (
                      <ListBox.Item key={b.id} id={b.id} textValue={`Bloque #${idx + 1}: ${b.title}`}>
                        Bloque #{idx + 1}: {b.title}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>
            )}

            <TextField isRequired className="w-full">
              <Label className="text-xs font-semibold text-muted uppercase tracking-wider">
                {isDecision ? 'Detalle del Acuerdo' : 'Descripción de la Tarea'}
              </Label>
              <TextArea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={isDecision ? 'Ej: Se aprueba la propuesta de navegación móvil...' : 'Ej: Compartir prototipo en #orion...'}
                autoFocus
              />
            </TextField>

            {!isDecision && (
              <TextField className="w-full">
                <Label className="text-xs font-semibold text-muted uppercase tracking-wider">
                  Responsable Asignado (@mención o nombre)
                </Label>
                <Input
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                  placeholder="@Nombre"
                />
              </TextField>
            )}

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border mt-1">
              <Button type="button" variant="ghost" size="sm" onPress={onClose} disabled={isSubmitting}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary" size="sm" className="font-semibold" disabled={!content.trim() || isSubmitting}>
                {isSubmitting ? 'Guardando…' : 'Guardar en Minuta'}
              </Button>
            </div>
          </form>
        </Modal.Dialog>
      </Modal.Container>
    </Modal>
  );
}
