import { Toaster as Sonner, toast } from "sonner";
import { WaxSealSvg, SkullSvg, FeatherSvg } from "@/components/ambient/pixelFx/sprites";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      swipeDirections={["left", "right"]}
      icons={{
        success: <WaxSealSvg size={16} />,
        error: <SkullSvg size={16} />,
        info: <FeatherSvg size={16} />,
        warning: <FeatherSvg size={16} />,
      }}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
