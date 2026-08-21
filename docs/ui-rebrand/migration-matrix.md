# Migration and parity matrix

| Surface | Behavioral owner | Presentation owner | Status / parity gate |
| --- | --- | --- | --- |
| Shared shell/navigation | React | `app/` + `components/bardo/AppChrome` | Complete: context navigation, safe areas, 390–1440 |
| Dialog/sheet | Base UI for new flows; legacy controller for existing forms | `components/ui/Dialog` + semantic responsive sheet | Complete for document-task flow; existing forms use the same visual contract and retain dirty protection |
| Feedback | Sonner + existing save coordinator | themed Toaster + contextual status | Complete: live states, recovery and undo |
| MemberPicker | Base UI Combobox / existing remote endpoints | `components/bardo/MemberPicker` | Complete for new flow: debounce, abort, keyboard, remote limit 25 |
| Home | React | `features/home` | Complete: four resource groups, navigation, empty/error/loading |
| Documents/Reader | proven `app.js` reader controller | semantic editorial surface + `features/documents` interaction island | Complete: render/copy/export/links plus React task dialog |
| Editor | `app.js` + reliability/save coordinator | shared editor toolbar, input and save-state language | Complete: formatting, dirty/save/conflict/history/retry preserved |
| Kanban | proven `board.js` controller | semantic Kanban module and migration adapters | Complete: compact CRUD surface, filters, DnD, keyboard alternative, terminal scroll padding |
| Planner | proven `event.js` controller | semantic agenda module and migration adapters | Complete: agenda/calendar/live, participants, blocks/items/tasks and responsive sheets |

The legacy behavioral controllers remain intentionally because replacing working domain orchestration would expand this UI mission and increase regression risk. Embedded module CSS is now compatibility input; `styles/theme.css` and `styles/discord-native.css` are visually authoritative.
