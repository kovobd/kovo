import { resolveImageSrc } from "@/lib/cdnImage";
import type { Testimonial as DbTestimonial } from "@/types/database";

export interface TestimonialItem {
  text: string;
  image?: string;
  name: string;
  role?: string;
}

interface TestimonialsSectionProps {
  testimonials: TestimonialItem[];
  badge?: string;
  title?: string;
  subtitle?: string;
}

const TestimonialsSection = ({
  testimonials,
  badge = "Testimonials",
  title = "What our customers say",
  subtitle = "Real stories from Kovo customers.",
}: TestimonialsSectionProps) => {
  if (!testimonials.length) return null;

  return (
    <section className="py-8 sm:py-10 lg:py-14 section-padding contain-content">
      <div className="container mx-auto z-10">
        <div className="flex flex-col items-center justify-center max-w-[540px] mx-auto text-center">
          <div className="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-[0.18em] glass-card">
            {badge}
          </div>
          <h2 className="text-lg sm:text-xl lg:text-2xl font-semibold tracking-tight text-foreground mt-4">
            {title}
          </h2>
          {subtitle && (
            <p className="text-xs sm:text-sm text-muted-foreground mt-2 max-w-md">
              {subtitle}
            </p>
          )}
          <div className="premium-divider max-w-[60px] mx-auto mt-4" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mt-10">
          {testimonials.map(({ text, image, name, role }, i) => (
            <div
              key={`${name}-${i}`}
              className="p-6 sm:p-7 rounded-3xl glass-card w-full"
            >
              <p className="text-[13.5px] sm:text-sm text-foreground/85 leading-relaxed">
                "{text}"
              </p>
              <div className="flex items-center gap-3 mt-5">
                {image ? (
                  <img
                    src={resolveImageSrc(image, 400)}
                    alt={name}
                    width={40}
                    height={40}
                    className="h-10 w-10 rounded-full object-cover shrink-0"
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center text-[13px] font-semibold text-foreground shrink-0">
                    {name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="leading-tight min-w-0">
                  <div className="text-[13.5px] font-semibold tracking-tight text-foreground truncate">
                    {name}
                  </div>
                  {role && (
                    <div className="text-[12px] text-muted-foreground mt-0.5 truncate">
                      {role}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TestimonialsSection;

// Helper to convert DB rows
export const fromDbTestimonials = (rows: DbTestimonial[]): TestimonialItem[] =>
  rows.map((t) => ({
    text: t.review,
    image: t.image_url ?? undefined,
    name: t.name,
    role: undefined,
  }));
