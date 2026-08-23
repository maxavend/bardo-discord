function handleClick(e){
  const close=e.target.closest('.close');if(close)return closeDialog(close.closest('dialog'));
  const tab=e.target.closest('[data-col-tab]');if(tab){state.activeColumnId=tab.dataset.colTab;persist();render();return}
  const card=e.target.closest('[data-task]');if(card)return openTask(card.dataset.task);
  const add=e.target.closest('[data-add-column-task]');if(add)return openQuick(add.dataset.addColumnTask);
  const more=e.target.closest('[data-more]');if(more){const key=`${currentBoard().id}:${more.dataset.more}`;renderLimits.set(key,(renderLimits.get(key)||PAGE_SIZE)+PAGE_SIZE);renderBoard();return}
  const board=e.target.closest('[data-board]');if(board){state.activeBoardId=board.dataset.board;state.activeColumnId=currentBoard().columns[0].id;state.filters=[];renderLimits.clear();persist();render();closeDialog('board-picker-dialog');return}
  const tag=e.target.closest('[data-task-tag]');if(tag)return toggleTaskTag(tag.dataset.taskTag);
  const stDel=e.target.closest('[data-subtask-delete]');if(stDel){const t=taskById(activeTaskId);t.subtasks=t.subtasks.filter(x=>x.id!==stDel.dataset.subtaskDelete);persist();renderSubtasks(t);render();return}
  const cmDel=e.target.closest('[data-comment-delete]');if(cmDel){const t=taskById(activeTaskId);t.comments=t.comments.filter(x=>x.id!==cmDel.dataset.commentDelete);persist();renderComments(t);render();return}
  const up=e.target.closest('[data-column-up]');if(up)return moveDraftColumn(up.dataset.columnUp,-1);
  const down=e.target.closest('[data-column-down]');if(down)return moveDraftColumn(down.dataset.columnDown,1);
  const del=e.target.closest('[data-column-delete]');if(del)return deleteDraftColumn(del.dataset.columnDelete);
  const tagDel=e.target.closest('[data-tag-delete]');if(tagDel)return deleteDraftTag(tagDel.dataset.tagDelete);
}
