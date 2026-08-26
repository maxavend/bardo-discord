import {useState, useEffect} from 'react';
import {
  Button,
  Modal,
  TextField,
  Label,
  Input,
  TextArea,
} from '@heroui/react';

export function PlannerCaptureModal({isOpen, onClose, onSubmit, kind = 'decision', initialBlockId = null, blocks = []}) {
  const [content, setContent] = useState('');
  const [assignee, setAssignee] = useState('@Max Avendaño');
  const [selectedBlockId, setSelectedBlockId] = useState(initialBlockId || (blocks[0]?.id ?? ''));

  useEffect(() => {
    if (isOpen) {
      setContent('');
      setSelectedBlockId(initialBlockId || (blocks[0]?.id ?? ''));
    }
  }, [isOpen, initialBlockId, blocks]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!content.trim()) return;
    onSubmit({
      kind,
      blockId: selectedBlockId,
      content: content.trim(),
      assignee: kind === 'task' ? assignee.trim() : undefined,
    });
    onClose();
  };

  const isDecision = kind === 'decision';

  return (
    <Modal isOpen={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Modal.Backdrop />
      <Modal.Container>
        <Modal.Dialog className="max-w-md w-full p-6 bg-surface border border-border rounded-2xl shadow-2xl">
          <Modal.Header className="flex items-center justify-between pb-3 border-b border-border/60">
            <Modal.Heading className="text-lg font-bold text-foreground">
              {isDecision ? '🟢 Registrar Decisión / Acuerdo' : '🟣 Asignar Tarea / Compromiso'}
            </Modal.Heading>
            <Modal.CloseButton onPress={onClose} />
          </Modal.Header>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-4">
            {blocks.length > 1 && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-muted uppercase tracking-wider">
                  Bloque asociado
                </label>
                <select
                  value={selectedBlockId}
                  onChange={(e) => setSelectedBlockId(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl bg-field-background border border-border text-foreground text-sm focus:outline-none focus:border-accent"
                >
                  {blocks.map((b, idx) => (
                    <option key={b.id} value={b.id}>
                      Bloque #{idx + 1}: {b.title}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <TextField isRequired className="w-full">
              <Label className="text-xs font-semibold text-muted uppercase tracking-wider">
                {isDecision ? 'Detalle del acuerdo tomado' : 'Descripción de la tarea'}
              </Label>
              <TextArea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={isDecision ? 'Ej: Se aprueba la propuesta de navegación móvil...' : 'Ej: Compartir prototipo en #orion...'}
                className="min-h-[80px] text-sm"
                autoFocus
              />
            </TextField>

            {!isDecision && (
              <TextField className="w-full">
                <Label className="text-xs font-semibold text-muted uppercase tracking-wider">
                  Responsable asignado (@mención o nombre)
                </Label>
                <Input
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                  placeholder="@Nombre"
                  className="text-sm"
                />
              </TextField>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40 mt-2">
              <Button type="button" variant="ghost" size="sm" onPress={onClose}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary" size="sm" className="font-semibold">
                Guardar en Minuta
              </Button>
            </div>
          </form>
        </Modal.Dialog>
      </Modal.Container>
    </Modal>
  );
}
