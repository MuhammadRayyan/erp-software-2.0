import React from "react";
import { ModuleFlowGuide } from "./module-flow-guide";

interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  showFlowGuide?: boolean;
}

export function PageHeader({ title, description, children, showFlowGuide = true }: PageHeaderProps) {
  return (
    <div className="page-header">
      <div>
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="page-title">{title}</h1>
          {showFlowGuide && <ModuleFlowGuide />}
        </div>
        {description && <p className="page-description">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

