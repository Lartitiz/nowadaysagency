import { Fragment, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { getBreadcrumbItems, type BreadcrumbItem } from "@/lib/breadcrumb-config";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export default function AutoBreadcrumb() {
  const { pathname, search } = useLocation();
  const isMobile = useIsMobile();
  const items = getBreadcrumbItems(pathname, search);

  if (!items || items.length === 0) return null;

  // Mobile: truncate middle items if > 3
  const shouldTruncate = isMobile && items.length > 3;
  const visibleItems: (BreadcrumbItem | "ellipsis")[] = shouldTruncate
    ? [items[0], "ellipsis", items[items.length - 1]]
    : items;
  const hiddenItems = shouldTruncate ? items.slice(1, items.length - 1) : [];

  return (
    <nav className="flex items-center gap-1.5 text-[13px] font-body" aria-label="Fil d'Ariane">
      {visibleItems.map((item, i) => (
        <Fragment key={i}>
          {i > 0 && <span className="text-muted-foreground/40 select-none">›</span>}
          {item === "ellipsis" ? (
            <EllipsisDropdown items={hiddenItems} />
          ) : item.path ? (
            <Link
              to={item.path}
              className="text-muted-foreground hover:text-primary transition-colors"
            >
              {item.label}
            </Link>
          ) : (
            <span className="text-foreground/70 font-medium">{item.label}</span>
          )}
        </Fragment>
      ))}
    </nav>
  );
}

function EllipsisDropdown({ items }: { items: BreadcrumbItem[] }) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="text-muted-foreground hover:text-primary transition-colors px-1"
          aria-label="Afficher les pages intermédiaires"
        >
          …
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2 space-y-1" align="start" sideOffset={4}>
        {items.map((item, i) => (
          <Link
            key={i}
            to={item.path || "#"}
            className="block text-sm text-muted-foreground hover:text-primary transition-colors px-2 py-1 rounded-md hover:bg-muted"
            onClick={() => setOpen(false)}
          >
            {item.label}
          </Link>
        ))}
      </PopoverContent>
    </Popover>
  );
}
