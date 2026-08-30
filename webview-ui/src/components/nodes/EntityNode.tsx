import React, { memo } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { NodeType, nodeTypeLabel } from "../../model/NodeType";
import { EntityNodeData } from "../../types";
import { ACCENT_COLORS, CLIP_PATHS, BORDER_RADIUS, SELECTED_BORDER_COLOR } from "./entityNodeStyles";

/**
 * Factory that builds one custom React Flow node component per NodeType.
 * All four share the same layout (colored header + body) but get a distinct
 * silhouette and accent color, mirroring the original desktop app.
 */
export function makeEntityNode(type: NodeType) {
  const accent = ACCENT_COLORS[type];
  const clipPath = CLIP_PATHS[type];
  const borderRadius = BORDER_RADIUS[type];

  const Component: React.FC<NodeProps<EntityNodeData>> = ({ data, selected }) => {
    const { rosNode } = data;
    return (
      <div
        className="entity-node"
        style={{
          clipPath,
          borderRadius,
          border: `2px solid ${selected ? SELECTED_BORDER_COLOR : "var(--vscode-panel-border, #454545)"}`,
        }}
      >
        <Handle type="target" position={Position.Left} className="entity-handle" />
        <div className="entity-node-header" style={{ background: accent }}>
          {nodeTypeLabel(type).toUpperCase()}
        </div>
        <div className="entity-node-body">
          <div className="entity-node-name" title={rosNode.nodeName}>
            {rosNode.nodeName}
          </div>
          <div className="entity-node-topic" title={rosNode.topic}>
            {rosNode.topic}
          </div>
          <div className="entity-node-msgtype" title={rosNode.messageType}>
            {rosNode.messageType}
          </div>
        </div>
        <Handle type="source" position={Position.Right} className="entity-handle" />
      </div>
    );
  };
  Component.displayName = `EntityNode(${type})`;
  return memo(Component);
}
