# Board Service

Collaborative whiteboard service for CollabSpace with AI diagram generation.

## Port
`4005`

## Responsibilities
- Whiteboard CRUD with workspace scoping
- Element management: 12 types (rectangle, ellipse, triangle, line, arrow, text, sticky note, image, freehand, connector, group, frame)
- Connector auto-routing between shapes
- Z-index management (bring to front, send to back)
- Batch operations for multi-select
- Export to PNG, SVG, PDF
- AI-powered features: prompt-to-diagram, diagram-to-code, auto-layout

## Key Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /boards | Create board |
| GET | /boards | List boards |
| GET | /boards/:id | Get board with elements |
| PUT | /boards/:id | Update metadata |
| DELETE | /boards/:id | Soft delete |
| POST | /boards/:id/elements | Add element(s) |
| PUT | /boards/:id/elements/:eid | Update element |
| DELETE | /boards/:id/elements/:eid | Delete element |
| POST | /boards/:id/export | Export (png/svg/pdf) |
| GET | /boards/:id/history | Version history |
| POST | /boards/:id/ai/generate | AI diagram from prompt |

## Element Properties
Each element has: `id`, `type`, `position` (x, y, width, height, rotation), `style` (fill, stroke, strokeWidth, opacity), `z_index`, `group_id`, `locked`

## AI Features
- **Prompt → Diagram**: "Draw a microservices architecture" generates positioned shapes
- **Diagram → Code**: Analyze board elements and generate architecture code
- **Auto-Layout**: Automatically arrange overlapping elements
