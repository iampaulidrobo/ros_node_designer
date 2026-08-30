import React from "react";
import { RosNode } from "../model/RosNode";
import { listMessageTypes } from "../utils/messageTypes";

interface Props {
  selectedNode: RosNode | undefined;
  onChange: (patch: Partial<Pick<RosNode, "nodeName" | "topic" | "messageType">>) => void;
}

const PropertyPanel: React.FC<Props> = ({ selectedNode, onChange }) => {
  if (!selectedNode) {
    return (
      <div className="property-panel">
        <div className="property-panel__empty">No entity selected</div>
      </div>
    );
  }

  return (
    <div className="property-panel">
      <label className="property-panel__field">
        <span>Entity name</span>
        <input
          type="text"
          value={selectedNode.nodeName}
          onChange={(e) => onChange({ nodeName: e.target.value })}
        />
      </label>
      <label className="property-panel__field">
        <span>Topic / Service / Action</span>
        <input
          type="text"
          value={selectedNode.topic}
          onChange={(e) => onChange({ topic: e.target.value })}
        />
      </label>
      <label className="property-panel__field">
        <span>Message type</span>
        <select
          value={selectedNode.messageType}
          onChange={(e) => onChange({ messageType: e.target.value })}
        >
          {listMessageTypes().map((mt) => (
            <option key={mt} value={mt}>
              {mt}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
};

export default PropertyPanel;
