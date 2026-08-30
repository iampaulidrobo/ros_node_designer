import React from "react";
import { NodeType } from "../model/NodeType";

interface Props {
  onAdd: (type: NodeType) => void;
  onGeneratePackage: () => void;
  onSaveProject: () => void;
  onOpenProject: () => void;
  onNewProject: () => void;
}

const Toolbar: React.FC<Props> = ({
  onAdd,
  onGeneratePackage,
  onSaveProject,
  onOpenProject,
  onNewProject,
}) => {
  return (
    <div className="toolbar">
      <button onClick={() => onAdd("node")}>Add Node</button>
      <button onClick={() => onAdd("topic")}>Add Topic</button>
      <button onClick={() => onAdd("service")}>Add Service</button>
      <button onClick={() => onAdd("action")}>Add Action</button>
      <div className="toolbar__separator" />
      <button onClick={onGeneratePackage}>Generate Package</button>
      <div className="toolbar__separator" />
      <button onClick={onSaveProject}>Save Project</button>
      <button onClick={onOpenProject}>Open Project</button>
      <button onClick={onNewProject}>New Project</button>
    </div>
  );
};

export default Toolbar;
