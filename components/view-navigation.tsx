import Link from "next/link";
import { HorariaIcon, type HorariaIconName } from "./horaria-icon";

export default function ViewNavigation({
  label,
  items,
}: {
  label: string;
  items: Array<{
    label: string;
    href: string;
    icon: HorariaIconName;
    active: boolean;
  }>;
}) {
  return (
    <nav className="consolidated-view-nav" aria-label={label}>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
        >
          <HorariaIcon name={item.icon} />
          <span>{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}
