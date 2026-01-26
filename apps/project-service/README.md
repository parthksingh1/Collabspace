# Project Service

Project management with Kanban boards, sprints, and AI-powered planning for CollabSpace.

## Port
`4006`

## Responsibilities
- Project CRUD with templates (blank, scrum, kanban, bug tracking)
- Task management with rich filtering, status transitions, and relationships
- Auto-incrementing task keys via PostgreSQL trigger (PROJ-1, PROJ-2, ...)
- Sprint lifecycle: planning → active → completed
- Burndown chart data calculation
- Velocity tracking (rolling average over sprints)
- Dependency graph with cycle detection
- Optimistic concurrency control (version field)
- AI-powered: task breakdown, priority suggestion, sprint planning, delivery prediction

## Key Endpoints

### Projects
| Method | Path | Description |
|--------|------|-------------|
| POST | /projects | Create project |
| GET | /projects | List projects |
| GET | /projects/:id | Get project |
| PUT | /projects/:id | Update project |
| DELETE | /projects/:id | Soft delete |

### Tasks
| Method | Path | Description |
|--------|------|-------------|
| POST | /projects/:id/tasks | Create task |
| GET | /projects/:id/tasks | List (with filters) |
| GET | /tasks/:id | Get task detail |
| PUT | /tasks/:id | Update task |
| PUT | /tasks/:id/status | Change status |
| PUT | /tasks/:id/assign | Assign user |
| POST | /tasks/:id/comments | Add comment |
| POST | /tasks/:id/subtasks | Create subtask |
| GET | /tasks/:id/activity | Activity log |

### Sprints
| Method | Path | Description |
|--------|------|-------------|
| POST | /projects/:id/sprints | Create sprint |
| GET | /projects/:id/sprints | List sprints |
| POST | /sprints/:id/start | Start sprint |
| POST | /sprints/:id/complete | Complete sprint |
| GET | /sprints/:id/burndown | Burndown data |
| GET | /sprints/:id/velocity | Velocity metrics |

## Status Machine
```
backlog → todo → in_progress → review → done
```
Only forward transitions are allowed via the status endpoint.

## Task Relationships
- `blocks` / `is_blocked_by`: Dependency chain
- `relates_to`: Related work
- `duplicate_of`: Duplicate detection
- Cycle detection prevents circular dependencies
