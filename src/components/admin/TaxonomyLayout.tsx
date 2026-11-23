import { NavLink, Outlet } from "react-router-dom";
import { cn } from "@/lib/utils";

const tabs = [
  { to: "/admin/taxonomy/categories", label: "Categories" },
  { to: "/admin/taxonomy/tags", label: "Tags" },
  { to: "/admin/taxonomy/brands", label: "Brands" },
];

const TaxonomyLayout = () => (
  <div className="a-page-fade">
    <div className="a-page-head">
      <div>
        <h1 className="a-page-head-title">Taxonomy</h1>
        <p className="a-page-head-sub hidden sm:block">Organize your catalog into categories, tags and brands.</p>
      </div>
    </div>

    <div className="a-tabs-flat mb-4 sm:gap-0 gap-1">
      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end
          className={({ isActive }) => cn("a-tab flex-1 sm:flex-initial justify-center sm:justify-start", isActive && "is-active")}
        >
          {t.label}
        </NavLink>
      ))}
    </div>

    <Outlet />
  </div>
);

export default TaxonomyLayout;
