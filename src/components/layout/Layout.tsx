import { Outlet, useLocation } from "react-router-dom";
import Header from "./Header";
import FloatingIcons from "./FloatingIcons";
import AnnouncementBar from "./AnnouncementBar";
import Footer from "./Footer";
import { LayoutDataProvider } from "./LayoutDataProvider";
import ScrollProgress from "@/components/ui/ScrollProgress";



const Layout = () => {
  const location = useLocation();
  return (
    <LayoutDataProvider>
      <ScrollProgress />
      <div className="kovo-store min-h-screen flex flex-col">
        <AnnouncementBar />
        <Header />
        <main key={location.pathname} className="flex-1 gv-page-fade">
          <Outlet />
        </main>
        <Footer />
        <FloatingIcons />
      </div>
    </LayoutDataProvider>
  );
};

export default Layout;
