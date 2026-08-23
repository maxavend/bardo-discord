import { Pencil, Xmark } from '@gravity-ui/icons';
import {
  Avatar,
  Button,
  Checkbox,
  Chip,
  Input,
  Label,
  Modal,
  Separator,
  Tag,
  TagGroup,
  TextArea,
  TextField,
  Toolbar,
} from '@heroui/react';
import { useEffect, useMemo, useState } from 'react';
import type { Key } from '@heroui/react';
import { NativeSelect } from './NativeControls';
import {
  MAX_COMMENTS,
  MAX_SUBTASKS,
  ME,
  people,
  personById,
  priorities,
  priorityLabel,
  type Board,
  type Priority,
  type Task,
} from './model';

const ICON_CLASS = 'size-4 shrink-0';

type TaskDraft = Pick<Task, 'title' | 'description' | 'status' | 'assignee' | 'priority' | 'tags' | 'subtasks'>;

type Props = {
  isOpen: boolean;
  task: Task | null;
  board: Board;
  onOpenChange: (open: boolean) => void;
  onUpdateTask: (taskId: string, patch: Partial<Task>) => void;
  onMoveTask: (taskId: string, status: string) => void;
  onDeleteTask: () => void;
  onDuplicateTask: () => void;
};

function makeDraft(task: Task): TaskDraft {
  return {
    title: task.title,
    description: task.description,
    status: task.status,
    assignee: task.assignee,
    priority: task.priority,
    tags: [...task.tags],
    subtasks: task.subtasks.map((item) => ({ ...item })),
  };
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function TaskDetailModal({
  isOpen,
  task,
  board,
  onOpenChange,
  onUpdateTask,
  onMoveTask,
  onDeleteTask,
  onDuplicateTask,
}: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<TaskDraft | null>(task ? makeDraft(task) : null);
  const [subtaskDraft, setSubtaskDraft] = useState('');
  const [commentDraft, setCommentDraft] = useState('');

  useEffect(() => {
    if (!task || !isOpen) return;
    setIsEditing(false);
    setDraft(makeDraft(task));
    setSubtaskDraft('');
    setCommentDraft('');
  }, [task?.id, isOpen]);

  const columnTitle = useMemo(
    () => board.columns.find((column) => column.id === task?.status)?.title ?? 'Sin columna',
    [board.columns, task?.status],
  );

  if (!task || !draft) return null;

  const person = personById(task.assignee);
  const doneSubtasks = task.subtasks.filter((item) => item.done).length;

  const close = () => onOpenChange(false);

  const startEditing = () => {
    setDraft(makeDraft(task));
    setSubtaskDraft('');
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setDraft(makeDraft(task));
    setSubtaskDraft('');
    setIsEditing(false);
  };

  const saveEditing = () => {
    const title = draft.title.trim();
    if (!title) return;
    onUpdateTask(task.id, {
      title: title.slice(0, 180),
      description: draft.description.slice(0, 3000),
      assignee: draft.assignee,
      priority: draft.priority,
      tags: draft.tags,
      subtasks: draft.subtasks,
    });
    if (draft.status !== task.status) onMoveTask(task.id, draft.status);
    setIsEditing(false);
  };

  const toggleLiveSubtask = (subtaskId: string) => {
    onUpdateTask(task.id, {
      subtasks: task.subtasks.map((item) => item.id === subtaskId ? { ...item, done: !item.done } : item),
    });
  };

  const toggleDraftSubtask = (subtaskId: string) => {
    setDraft((current) => current ? {
      ...current,
      subtasks: current.subtasks.map((item) => item.id === subtaskId ? { ...item, done: !item.done } : item),
    } : current);
  };

  const removeDraftSubtask = (subtaskId: string) => {
    setDraft((current) => current ? {
      ...current,
      subtasks: current.subtasks.filter((item) => item.id !== subtaskId),
    } : current);
  };

  const addDraftSubtask = () => {
    const text = subtaskDraft.trim();
    if (!text || draft.subtasks.length >= MAX_SUBTASKS) return;
    setDraft((current) => current ? {
      ...current,
      subtasks: [
        ...current.subtasks,
        { id: `subtask-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, text: text.slice(0, 140), done: false },
      ],
    } : current);
    setSubtaskDraft('');
  };

  const addComment = () => {
    const text = commentDraft.trim();
    if (!text || task.comments.length >= MAX_COMMENTS) return;
    onUpdateTask(task.id, {
      comments: [
        ...task.comments,
        {
          id: `comment-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
          author: ME,
          text: text.slice(0, 800),
          created: new Date().toISOString(),
        },
      ],
    });
    setCommentDraft('');
  };

  const statusOptions = board.columns.map((column) => ({ id: column.id, label: column.title }));
  const assigneeOptions = [
    { id: '', label: 'Sin responsable' },
    ...people.map((item) => ({ id: item.id, label: item.name })),
  ];
  const priorityOptions = priorities.map((item) => ({ id: item, label: priorityLabel[item] }));

  return (
    <Modal>
      <Modal.Backdrop variant="blur" isOpen={isOpen} onOpenChange={onOpenChange}>
        <Modal.Container placement="auto" size="lg" scroll="inside">
          <Modal.Dialog>
            <Modal.CloseTrigger />

            {!isEditing ? (
              <>
                <Modal.Header className="bardo-detail-header">
                  <div className="bardo-detail-heading-copy">
                    <Modal.Heading className="bardo-detail-title">{task.title}</Modal.Heading>
                    <p className="bardo-detail-updated">Editada {formatTimestamp(task.updated)}</p>
                  </div>
                </Modal.Header>

                <Modal.Body className="bardo-detail-body" data-testid="task-read-view">
                  {task.description ? (
                    <p className="bardo-detail-description">{task.description}</p>
                  ) : (
                    <p className="bardo-detail-description bardo-detail-description-empty">Sin descripción.</p>
                  )}

                  <div className="bardo-detail-properties" aria-label="Propiedades de la tarea">
                    <div className="bardo-detail-property">
                      <span className="bardo-detail-property-label">Columna</span>
                      <span className="bardo-detail-property-value">{columnTitle}</span>
                    </div>
                    <div className="bardo-detail-property">
                      <span className="bardo-detail-property-label">Responsable</span>
                      <span className="bardo-detail-property-person">
                        <Avatar size="sm" variant="soft" aria-label={person?.name ?? 'Sin responsable'}>
                          <Avatar.Fallback>{person?.initials ?? '—'}</Avatar.Fallback>
                        </Avatar>
                        <span className="bardo-detail-property-value">{person?.name ?? 'Sin responsable'}</span>
                      </span>
                    </div>
                    <div className="bardo-detail-property">
                      <span className="bardo-detail-property-label">Prioridad</span>
                      <span className="bardo-detail-property-value">{priorityLabel[task.priority]}</span>
                    </div>
                    <div className="bardo-detail-property">
                      <span className="bardo-detail-property-label">Tags</span>
                      <span className="bardo-detail-tags">
                        {task.tags.length ? task.tags.map((tag) => <Chip key={tag} size="sm" variant="tertiary">{tag}</Chip>) : <span className="text-muted">Sin tags</span>}
                      </span>
                    </div>
                  </div>

                  <Separator />

                  <section className="bardo-detail-section" aria-labelledby="detail-subtasks-heading">
                    <div className="bardo-detail-section-heading">
                      <h3 id="detail-subtasks-heading">Subtareas</h3>
                      <span>{doneSubtasks}/{task.subtasks.length}</span>
                    </div>
                    {task.subtasks.length ? (
                      <div className="bardo-detail-subtasks">
                        {task.subtasks.map((item) => (
                          <Checkbox
                            key={item.id}
                            isSelected={item.done}
                            onChange={() => toggleLiveSubtask(item.id)}
                            aria-label={`${item.done ? 'Completada' : 'Pendiente'}: ${item.text}`}
                          >
                            <Checkbox.Content>
                              <Checkbox.Control><Checkbox.Indicator /></Checkbox.Control>
                              <span className={item.done ? 'text-muted line-through' : ''}>{item.text}</span>
                            </Checkbox.Content>
                          </Checkbox>
                        ))}
                      </div>
                    ) : <p className="bardo-detail-empty">Sin subtareas.</p>}
                  </section>

                  <Separator />

                  <section className="bardo-detail-section" aria-labelledby="detail-comments-heading">
                    <div className="bardo-detail-section-heading">
                      <h3 id="detail-comments-heading">Comentarios</h3>
                      <span>{task.comments.length}</span>
                    </div>
                    {task.comments.length ? (
                      <div className="bardo-detail-comments">
                        {task.comments.map((comment) => {
                          const author = personById(comment.author);
                          return (
                            <article className="bardo-detail-comment" key={comment.id}>
                              <Avatar size="sm" variant="soft" aria-label={author?.name ?? 'Persona'}>
                                <Avatar.Fallback>{author?.initials ?? '—'}</Avatar.Fallback>
                              </Avatar>
                              <div className="bardo-detail-comment-copy">
                                <div className="bardo-detail-comment-meta">
                                  <strong>{author?.name ?? 'Persona'}</strong>
                                  <span>{formatTimestamp(comment.created)}</span>
                                </div>
                                <p>{comment.text}</p>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    ) : <p className="bardo-detail-empty">Todavía no hay comentarios.</p>}

                    <div className="bardo-comment-composer">
                      <TextArea
                        variant="secondary"
                        fullWidth
                        rows={2}
                        value={commentDraft}
                        onChange={(event) => setCommentDraft(event.target.value)}
                        placeholder="Añadir comentario…"
                        maxLength={800}
                        aria-label="Nuevo comentario"
                      />
                      <Button variant="secondary" size="sm" isDisabled={!commentDraft.trim()} onPress={addComment}>Comentar</Button>
                    </div>
                  </section>
                </Modal.Body>

                <Modal.Footer className="bardo-detail-footer">
                  <Button variant="secondary" onPress={onDuplicateTask}>Duplicar</Button>
                  <Button variant="primary" onPress={startEditing}>
                    <Pencil className={ICON_CLASS} aria-hidden="true" />
                    Editar
                  </Button>
                </Modal.Footer>
              </>
            ) : (
              <>
                <Modal.Header className="bardo-detail-header">
                  <div className="bardo-detail-heading-copy">
                    <Modal.Heading>Editar tarea</Modal.Heading>
                    <p className="bardo-detail-updated">Los cambios se aplican al guardar.</p>
                  </div>
                </Modal.Header>

                <Modal.Body className="bardo-edit-body" data-testid="task-edit-view">
                  <TextField variant="secondary">
                    <Label>Título</Label>
                    <Input
                      autoFocus
                      fullWidth
                      value={draft.title}
                      onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                      maxLength={180}
                      aria-label="Título de la tarea"
                    />
                  </TextField>

                  <TextField variant="secondary">
                    <Label>Descripción</Label>
                    <TextArea
                      fullWidth
                      rows={4}
                      value={draft.description}
                      onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                      maxLength={3000}
                      aria-label="Descripción"
                    />
                  </TextField>

                  <div className="bardo-edit-properties">
                    <NativeSelect label="Columna" value={draft.status} options={statusOptions} onChange={(status) => setDraft({ ...draft, status })} />
                    <NativeSelect label="Responsable" value={draft.assignee} options={assigneeOptions} onChange={(assignee) => setDraft({ ...draft, assignee })} />
                    <NativeSelect label="Prioridad" value={draft.priority} options={priorityOptions} onChange={(priority) => setDraft({ ...draft, priority: priority as Priority })} />
                  </div>

                  <Separator />

                  <section className="bardo-detail-section" aria-labelledby="edit-tags-heading">
                    <div className="bardo-detail-section-heading">
                      <h3 id="edit-tags-heading">Tags</h3>
                      <span>{draft.tags.length}/{board.tags.length}</span>
                    </div>
                    {board.tags.length ? (
                      <TagGroup
                        aria-label="Tags de la tarea"
                        selectionMode="multiple"
                        selectedKeys={new Set<Key>(draft.tags)}
                        onSelectionChange={(keys) => {
                          const tags = keys === 'all' ? [...board.tags] : Array.from(keys).map(String);
                          setDraft({ ...draft, tags });
                        }}
                        size="sm"
                      >
                        <TagGroup.List>{board.tags.map((tag) => <Tag id={tag} key={tag}>{tag}</Tag>)}</TagGroup.List>
                      </TagGroup>
                    ) : <p className="bardo-detail-empty">Este tablero todavía no tiene tags.</p>}
                  </section>

                  <Separator />

                  <section className="bardo-detail-section" aria-labelledby="edit-subtasks-heading">
                    <div className="bardo-detail-section-heading">
                      <h3 id="edit-subtasks-heading">Subtareas</h3>
                      <span>{draft.subtasks.filter((item) => item.done).length}/{draft.subtasks.length}</span>
                    </div>
                    <div className="bardo-edit-subtasks">
                      {draft.subtasks.map((item) => (
                        <div className="bardo-edit-subtask" key={item.id}>
                          <Checkbox isSelected={item.done} onChange={() => toggleDraftSubtask(item.id)} aria-label={`${item.done ? 'Completada' : 'Pendiente'}: ${item.text}`}>
                            <Checkbox.Content>
                              <Checkbox.Control><Checkbox.Indicator /></Checkbox.Control>
                              <span className={item.done ? 'text-muted line-through' : ''}>{item.text}</span>
                            </Checkbox.Content>
                          </Checkbox>
                          <Button variant="ghost" size="sm" isIconOnly aria-label={`Eliminar subtarea ${item.text}`} onPress={() => removeDraftSubtask(item.id)}>
                            <Xmark className={ICON_CLASS} aria-hidden="true" />
                          </Button>
                        </div>
                      ))}
                    </div>
                    <div className="bardo-edit-subtask-add">
                      <Input
                        variant="secondary"
                        fullWidth
                        value={subtaskDraft}
                        onChange={(event) => setSubtaskDraft(event.target.value)}
                        placeholder="Nueva subtarea"
                        maxLength={140}
                        aria-label="Nueva subtarea"
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            addDraftSubtask();
                          }
                        }}
                      />
                      <Button variant="secondary" isDisabled={!subtaskDraft.trim() || draft.subtasks.length >= MAX_SUBTASKS} onPress={addDraftSubtask}>Añadir</Button>
                    </div>
                  </section>
                </Modal.Body>

                <Modal.Footer className="bardo-detail-footer bardo-detail-footer-edit">
                  <Button variant="danger" onPress={onDeleteTask}>Eliminar</Button>
                  <Toolbar aria-label="Edición de tarea">
                    <Button variant="secondary" onPress={cancelEditing}>Cancelar</Button>
                    <Button variant="primary" isDisabled={!draft.title.trim()} onPress={saveEditing}>Guardar</Button>
                  </Toolbar>
                </Modal.Footer>
              </>
            )}
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
