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
import {
  CircleCheck,
  ListCheck,
} from '@gravity-ui/icons';

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
      <Modal.Backdrop>
        <Modal.Container>
          <Modal.Dialog className="max-w-md w-full">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading className="text-base font-semibold text-foreground flex items-center gap-2">
                {isDecision ? (
                  <CircleCheck width={16} height={16} className="text-success" />
                ) : (
                  <ListCheck width={16} height={16} className="text-accent" />
                )}
                <span>{isDecision ? 'Registrar decisión' : 'Asignar tarea'}</span>
              </Modal.Heading>
            </Modal.Header>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <Modal.Body className="flex flex-col gap-3.5">
                {blocks.length > 0 && (
                  <Select
                    fullWidth
                    selectedKey={selectedBlockId || blocks[0]?.id}
                    onSelectionChange={(key) => setSelectedBlockId(String(key))}
                    variant="secondary"
                  >
                    <Label className="text-xs font-medium text-muted">
                      Bloque asociado
                    </Label>
                    <Select.Trigger>
                      <Select.Value />
                      <Select.Indicator />
                    </Select.Trigger>
                    <Select.Popover>
                      <ListBox>
                        {blocks.map((b, idx) => (
                          <ListBox.Item key={b.id} id={b.id} textValue={`Bloque 0${idx + 1}: ${b.title}`}>
                            Bloque 0{idx + 1}: {b.title}
                            <ListBox.ItemIndicator />
                          </ListBox.Item>
                        ))}
                      </ListBox>
                    </Select.Popover>
                  </Select>
                )}

                <TextField isRequired className="w-full">
                  <Label className="text-xs font-medium text-muted">
                    {isDecision ? 'Detalle del acuerdo' : 'Descripción de la tarea'}
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
                    <Label className="text-xs font-medium text-muted">
                      Responsable asignado (@mención o nombre)
                    </Label>
                    <Input
                      value={assignee}
                      onChange={(e) => setAssignee(e.target.value)}
                      placeholder="@Nombre"
                    />
                  </TextField>
                )}
              </Modal.Body>

              <Modal.Footer className="flex items-center justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onPress={onClose} isDisabled={isSubmitting}>
                  Cancelar
                </Button>
                <Button type="submit" variant="primary" size="sm" isDisabled={!content.trim() || isSubmitting}>
                  {isSubmitting
                    ? 'Guardando…'
                    : isDecision
                    ? 'Guardar decisión'
                    : 'Guardar tarea'}
                </Button>
              </Modal.Footer>
            </form>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
