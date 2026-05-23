/**
 * Renderer interface — every graph composable must return this shape.
 *
 * draw({ dims, data })   — full render; dims = { w, h }, data = store graph data
 * updateEdgeStyles()     — reapply edge stroke/width without redraw
 * updateNodeColors()     — reapply node fills without redraw
 * drawOverlays()         — redraw ownership boundaries and violation rings
 * teardown()             — stop simulation, clean up listeners
 */
