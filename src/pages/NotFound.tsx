import { Link } from "react-router-dom";
import { ArrowLeftIcon } from "@/components/ui/icons";

const NotFound = () => {
  return (
    <div className="min-h-[70vh] flex items-center justify-center bg-background px-4">
      <div className="text-center max-w-md">
        <p className="kovo-label mb-4">Error 404</p>
        <h1 className="font-display text-2xl sm:text-3xl font-medium text-foreground mb-3">Page not found</h1>
        <p className="text-sm text-muted-foreground mb-8">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link to="/" className="btn-pill">
          <ArrowLeftIcon size={14} /> Back to home
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
