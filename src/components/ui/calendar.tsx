import * as React from "react";
import { ChevronLeftIcon as ChevronLeft, ChevronRightIcon as ChevronRight } from "@/components/ui/icons";
import { DayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-3",
        caption: "flex justify-center pt-1 relative items-center",
        caption_label: "text-[13px] font-semibold text-[#1d1d1f]",
        nav: "space-x-1 flex items-center",
        nav_button: cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 bg-transparent p-0 text-[#1d1d1f] opacity-70 hover:opacity-100 border-0",
        ),
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
        table: "w-full border-collapse space-y-1",
        head_row: "flex",
        head_cell: "text-[#86868b] rounded-md w-8 font-medium text-[11px]",
        row: "flex w-full mt-1",
        cell: "h-8 w-8 text-center text-[12.5px] p-0 relative focus-within:relative focus-within:z-20",
        day: cn(
          "h-8 w-8 p-0 font-normal text-[#1d1d1f] rounded-full hover:bg-[rgba(0,0,0,0.06)] aria-selected:opacity-100 transition-colors",
        ),
        day_selected:
          "bg-[#007aff] text-white hover:bg-[#007aff] hover:text-white focus:bg-[#007aff] focus:text-white",
        day_today: "font-semibold text-[#007aff]",
        day_outside: "text-[#1d1d1f]/30",
        day_disabled: "text-[#1d1d1f]/25",
        day_hidden: "invisible",
        ...classNames,
      }}
      components={{
        IconLeft: () => <ChevronLeft className="h-4 w-4" />,
        IconRight: () => <ChevronRight className="h-4 w-4" />,
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
