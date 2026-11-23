import { Outlet, useLocation } from "react-router-dom";
import { lazy, Suspense } from "react";
import Header from "./Header";
import FloatingIcons from "./FloatingIcons";
import AnnouncementBar from "./AnnouncementBar";
import Footer from "./Footer";
import { LayoutDataProvider } from "./LayoutDataProvider";
import ScrollProgress from "@/components/ui/ScrollProgress";

// Ambient pixel-fx system is lazy so it never blocks first paint.
const PixelFxRoot = lazy(() => import("@/components/ambient/pixelFx/PixelFxRoot"));


const Layout = () => {
  const location = useLocation();
  return (
    <LayoutDataProvider>
      <ScrollProgress />
      <div className="min-h-screen flex flex-col">
        <AnnouncementBar />
        <Header />
        <main key={location.pathname} className="flex-1 gv-page-fade">
          <Outlet />
        </main>
        <Footer />
        <FloatingIcons />
        <Suspense fallback={null}>
          <PixelFxRoot />
        </Suspense>
      </div>
    </LayoutDataProvider>
  );
};

export default Layout;
