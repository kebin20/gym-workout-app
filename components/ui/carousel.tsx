'use client';

import * as React from 'react';
import useEmblaCarousel, {
  type UseEmblaCarouselType,
} from 'embla-carousel-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';

type CarouselApi = UseEmblaCarouselType[1];
type UseCarouselParameters = Parameters<typeof useEmblaCarousel>;
type CarouselOptions = UseCarouselParameters[0];
type CarouselPlugin = UseCarouselParameters[1];

type CarouselProps = {
  opts?: CarouselOptions;
  plugins?: CarouselPlugin;
  orientation?: 'horizontal' | 'vertical';
  setApi?: (api: CarouselApi) => void;
  adaptiveHeight?: boolean;
  wheelNavigation?: boolean;
};

type CarouselContextProps = {
  carouselRef: ReturnType<typeof useEmblaCarousel>[0];
  api: ReturnType<typeof useEmblaCarousel>[1];
  scrollPrev: () => void;
  scrollNext: () => void;
  canScrollPrev: boolean;
  canScrollNext: boolean;
} & CarouselProps;

const CarouselContext = React.createContext<CarouselContextProps | null>(null);

function useCarousel() {
  const context = React.useContext(CarouselContext);

  if (!context) {
    throw new Error('useCarousel must be used within a <Carousel />');
  }

  return context;
}

function Carousel({
  orientation = 'horizontal',
  opts,
  setApi,
  plugins,
  adaptiveHeight = false,
  wheelNavigation = false,
  className,
  children,
  ...props
}: React.ComponentProps<'div'> & CarouselProps) {
  const [carouselRef, api] = useEmblaCarousel(
    {
      ...opts,
      axis: orientation === 'horizontal' ? 'x' : 'y',
    },
    plugins,
  );
  const [canScrollPrev, setCanScrollPrev] = React.useState(false);
  const [canScrollNext, setCanScrollNext] = React.useState(false);

  const onSelect = React.useCallback((api: CarouselApi) => {
    if (!api) return;
    setCanScrollPrev(api.canScrollPrev());
    setCanScrollNext(api.canScrollNext());
  }, []);

  const scrollPrev = React.useCallback(() => {
    api?.scrollPrev();
  }, [api]);

  const scrollNext = React.useCallback(() => {
    api?.scrollNext();
  }, [api]);

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        scrollPrev();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        scrollNext();
      }
    },
    [scrollPrev, scrollNext],
  );

  React.useEffect(() => {
    if (!api || !setApi) return;
    setApi(api);
  }, [api, setApi]);

  React.useEffect(() => {
    if (!api) return;
    onSelect(api);
    api.on('reInit', onSelect);
    api.on('select', onSelect);

    return () => {
      api?.off('select', onSelect);
    };
  }, [api, onSelect]);

  React.useEffect(() => {
    if (!api || !adaptiveHeight) return;

    const viewport = api.rootNode();
    let resizeObserver: ResizeObserver | undefined;
    let animationFrame = 0;

    const updateHeight = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        const selectedSlide = api.slideNodes()[api.selectedScrollSnap()];
        if (!selectedSlide) return;
        viewport.style.height = `${Math.ceil(selectedSlide.getBoundingClientRect().height)}px`;
      });
    };

    const observeSelectedSlide = () => {
      resizeObserver?.disconnect();
      const selectedSlide = api.slideNodes()[api.selectedScrollSnap()];
      if (selectedSlide && 'ResizeObserver' in window) {
        resizeObserver = new ResizeObserver(updateHeight);
        resizeObserver.observe(selectedSlide);
      }
      updateHeight();
    };

    observeSelectedSlide();
    api.on('select', observeSelectedSlide);
    api.on('reInit', observeSelectedSlide);
    window.addEventListener('resize', updateHeight);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      api.off('select', observeSelectedSlide);
      api.off('reInit', observeSelectedSlide);
      window.removeEventListener('resize', updateHeight);
      viewport.style.removeProperty('height');
    };
  }, [adaptiveHeight, api]);

  React.useEffect(() => {
    if (!api || !wheelNavigation || orientation !== 'horizontal') return;

    const viewport = api.rootNode();
    let accumulatedDelta = 0;
    let activeDirection = 0;
    let gestureEndTimer = 0;

    const handleWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;

      event.preventDefault();
      window.clearTimeout(gestureEndTimer);
      gestureEndTimer = window.setTimeout(() => {
        accumulatedDelta = 0;
        activeDirection = 0;
      }, 180);

      const direction = event.deltaX > 0 ? 1 : -1;
      if (activeDirection === direction) return;
      if (
        accumulatedDelta !== 0 &&
        Math.sign(accumulatedDelta) !== direction
      ) {
        accumulatedDelta = 0;
      }
      accumulatedDelta += event.deltaX;
      if (Math.abs(accumulatedDelta) < 36) return;

      activeDirection = direction;
      if (accumulatedDelta > 0) api.scrollNext();
      else api.scrollPrev();
      accumulatedDelta = 0;
    };

    viewport.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      window.clearTimeout(gestureEndTimer);
      viewport.removeEventListener('wheel', handleWheel);
    };
  }, [api, orientation, wheelNavigation]);

  return (
    <CarouselContext.Provider
      value={{
        carouselRef,
        api: api,
        opts,
        adaptiveHeight,
        wheelNavigation,
        orientation:
          orientation || (opts?.axis === 'y' ? 'vertical' : 'horizontal'),
        scrollPrev,
        scrollNext,
        canScrollPrev,
        canScrollNext,
      }}
    >
      <div
        onKeyDownCapture={handleKeyDown}
        className={cn('relative', className)}
        role="region"
        aria-roledescription="carousel"
        data-slot="carousel"
        {...props}
      >
        {children}
      </div>
    </CarouselContext.Provider>
  );
}

function CarouselContent({ className, ...props }: React.ComponentProps<'div'>) {
  const { adaptiveHeight, carouselRef, orientation } = useCarousel();

  return (
    <div
      ref={carouselRef}
      className={cn(
        'overflow-hidden',
        adaptiveHeight && 'transition-[height] duration-300 ease-out',
      )}
      data-slot="carousel-content"
    >
      <div
        className={cn(
          'flex',
          adaptiveHeight && 'items-start',
          orientation === 'horizontal' ? '-ml-4' : '-mt-4 flex-col',
          className,
        )}
        {...props}
      />
    </div>
  );
}

function CarouselItem({ className, ...props }: React.ComponentProps<'div'>) {
  const { orientation } = useCarousel();

  return (
    <div
      role="group"
      aria-roledescription="slide"
      data-slot="carousel-item"
      className={cn(
        'min-w-0 shrink-0 grow-0 basis-full',
        orientation === 'horizontal' ? 'pl-4' : 'pt-4',
        className,
      )}
      {...props}
    />
  );
}

function CarouselPrevious({
  className,
  variant = 'outline',
  size = 'icon-sm',
  ...props
}: React.ComponentProps<typeof Button>) {
  const { orientation, scrollPrev, canScrollPrev } = useCarousel();

  return (
    <Button
      data-slot="carousel-previous"
      variant={variant}
      size={size}
      className={cn(
        'rounded-full absolute touch-manipulation',
        orientation === 'horizontal'
          ? 'inset-y-0 -left-12 my-auto'
          : '-top-12 left-1/2 -translate-x-1/2 rotate-90',
        className,
      )}
      disabled={!canScrollPrev}
      onClick={scrollPrev}
      {...props}
    >
      <ChevronLeftIcon className="cn-rtl-flip" />
      <span className="sr-only">Previous slide</span>
    </Button>
  );
}

function CarouselNext({
  className,
  variant = 'outline',
  size = 'icon-sm',
  ...props
}: React.ComponentProps<typeof Button>) {
  const { orientation, scrollNext, canScrollNext } = useCarousel();

  return (
    <Button
      data-slot="carousel-next"
      variant={variant}
      size={size}
      className={cn(
        'rounded-full absolute touch-manipulation',
        orientation === 'horizontal'
          ? 'inset-y-0 -right-12 my-auto'
          : '-bottom-12 left-1/2 -translate-x-1/2 rotate-90',
        className,
      )}
      disabled={!canScrollNext}
      onClick={scrollNext}
      {...props}
    >
      <ChevronRightIcon className="cn-rtl-flip" />
      <span className="sr-only">Next slide</span>
    </Button>
  );
}

export {
  type CarouselApi,
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
  useCarousel,
};
