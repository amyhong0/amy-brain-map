# UI Redesign Design Spec
**Date**: 2026-07-21
**Project**: Amy Brain Map
**Scope**: Wizard Space & Knowledge Graph UI Redesign

## Overview
Redesign the wizard space (wizard-tower component) and knowledge graph to match reference images while maintaining modern gothic hybrid aesthetic.

## Wizard Space Redesign

### Design Direction: Modern Gothic Hybrid
- **Style**: Combination of classical gothic elements with modern minimalist design
- **Atmosphere**: Mysterious but clean, not overly dark or ornate

### Background & Walls
- **Base Background**: Dark gray (#1a1a2e) to deep purple (#16213e) gradient
- **Stone Pattern**: Minimalist geometric stone texture, reduced excessive detail
- **Structure**: Modern vertical lines mixed with gothic arches
- **Shadows**: Subtle shadows, not too deep, maintaining modern feel

### Lighting Effects
- **Candles**: Warm orange/yellow base + purple neon border glow
- **Magic Aura**: Soft purple/blue gradient, neon glow effect
- **Light Rays**: Straight, clean light lines, minimal curves
- **Particles**: Small uniform size, floating in consistent patterns

### Character Design: Stardew Valley Style
- **Form**: Pixel art human characters (head, body, legs distinguishable)
- **Size**: Small pixel art (~32x32 pixel scale)
- **Design**: Simple but expressive forms, costume/colors matching each zone (wizard, alchemist, etc.)
- **Animation**: Small movements when working (arm movement, head shaking)
- **Shadow**: Small oval shadow beneath character

### Interactions
- **Working Effect**: Neon glow border, soft pulse animation
- **Movement Pattern**: Natural random movement, limited range
- **Click Interaction**: Modern modal, glassmorphism effect, smooth transitions

### Decorative Elements
- **Desk/Books**: Simplified forms, silhouette-focused
- **Alchemy Equipment**: Geometric forms, minimalist design
- **Windows**: Arched but with modern lines, simplified stained glass

## Knowledge Graph Redesign

### Design Direction: Obsidian Graph View Style
- **Style**: Clean network visualization with clear node/edge distinction
- **Atmosphere**: Professional, data-focused visualization

### Node Design
- **Form**: Circular nodes, size varies by tag count/importance
- **Colors**: Document type-based colors (PDF=blue, Web=green, Image=yellow, Default=purple)
- **Style**: Simple circles, minimal neon glow
- **Text**: Short label displayed inside node

### Edge Design
- **Style**: Thin straight lines, transparency indicates connection strength
- **Colors**: Purple-based, brightness adjusted by connection strength
- **Width**: 0.5px ~ 2px based on connection strength

### Background & Layout
- **Background**: Dark black/deep gray (#0a0a0f)
- **Layout**: Force-directed layout, natural distribution
- **Grid**: Very subtle dot pattern, barely visible

### Interactions
- **Drag**: Nodes draggable
- **Zoom/Pan**: Free zoom and pan
- **Hover**: Node highlight on hover

## Implementation Notes

### Files to Modify
1. `components/agents/wizard-tower.tsx` - Background, character, interaction redesign
2. `components/graph/knowledge-graph.tsx` - Node/edge styling, layout adjustments

### Technical Considerations
- Maintain existing React Flow integration for knowledge graph
- Preserve current agent state management
- Keep existing spell log functionality
- Ensure responsive design compatibility

### Color Palette Reference
- **Background**: #1a1a2e → #16213e (wizard space), #0a0a0f (knowledge graph)
- **Purple Accents**: #9C27B0, #7B1FA2
- **Node Colors**: #60a5fa (PDF), #34d399 (Web), #fbbf24 (Image), #8b5cf6 (Default)
- **Lighting**: Warm orange (#FFD700) mixed with purple neon

## Success Criteria
- Wizard space matches modern gothic hybrid aesthetic
- Characters appear as pixel art humans (not circles)
- Knowledge graph matches Obsidian graph view style
- All existing functionality preserved
- Smooth animations and transitions
