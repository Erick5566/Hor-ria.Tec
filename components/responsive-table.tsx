import {
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
  type TableHTMLAttributes,
} from "react";

type ElementProps = {
  children?: ReactNode;
  colSpan?: number;
  role?: string;
  scope?: string;
  "data-label"?: string;
};

function textContent(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) =>
      isValidElement<ElementProps>(child)
        ? textContent(child.props.children)
        : typeof child === "string" || typeof child === "number"
          ? String(child)
          : "",
    )
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Keep each column's heading next to its value when rows stack on phones. */
export default function ResponsiveTable({
  children,
  className = "",
  ...props
}: TableHTMLAttributes<HTMLTableElement>) {
  const headings: string[] = [];
  function collect(node: ReactNode, inHead = false) {
    Children.forEach(node, (child) => {
      if (!isValidElement<ElementProps>(child)) return;
      const head = inHead || child.type === "thead";
      if (head && child.type === "th")
        headings.push(textContent(child.props.children));
      else collect(child.props.children, head);
    });
  }
  collect(children);

  function annotate(node: ReactNode): ReactNode {
    return Children.map(node, (child) => {
      if (!isValidElement<ElementProps>(child)) return child;
      const element = child as ReactElement<ElementProps>;
      if (child.type === "tr") {
        let column = 0;
        function cells(nodes: ReactNode): ReactNode {
          return Children.map(nodes, (cell) => {
            if (!isValidElement<ElementProps>(cell)) return cell;
            if (cell.type !== "td" && cell.type !== "th") {
              return cloneElement(cell, {
                children: cells(cell.props.children),
              });
            }
            const label = headings[column] || "";
            column += cell.props.colSpan || 1;
            return cloneElement(cell, {
              role: cell.type === "th" ? "columnheader" : "cell",
              ...(cell.type === "th" ? { scope: "col" } : {}),
              ...(cell.type === "td" && !cell.props.colSpan
                ? { "data-label": label }
                : {}),
            });
          });
        }
        return cloneElement(element, {
          role: "row",
          children: cells(child.props.children),
        });
      }
      return cloneElement(element, {
        ...(child.type === "thead" || child.type === "tbody"
          ? { role: "rowgroup" }
          : {}),
        children: annotate(child.props.children),
      });
    });
  }

  return (
    <table
      {...props}
      role="table"
      className={`responsive-table ${className}`.trim()}
    >
      {annotate(children)}
    </table>
  );
}
