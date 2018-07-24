import {
  Directive,
  OnInit,
  ElementRef,
  OnDestroy,
  Output,
  EventEmitter,
  NgZone,
  Input,
  Renderer2,
  Optional
} from '@angular/core';
import { Subscription } from 'rxjs';
import { distinctUntilChanged, pairwise, filter, map } from 'rxjs/operators';
import { DraggableHelper } from './draggable-helper.provider';
import { DraggableScrollContainerDirective } from './draggable-scroll-container.directive';

function isCoordinateWithinRectangle(
  clientX: number,
  clientY: number,
  rect: ClientRect
): boolean {
  return (
    clientX >= rect.left &&
    clientX <= rect.right &&
    clientY >= rect.top &&
    clientY <= rect.bottom
  );
}

export interface OffsetEvent {
  x: number;
  y: number;
}
export interface DropEvent<T = any> {
  dropData: T;
  offset: OffsetEvent;
}

@Directive({
  selector: '[mwlDroppable]'
})
export class DroppableDirective implements OnInit, OnDestroy {
  /**
   * Added to the element when an element is dragged over it
   */
  @Input() dragOverClass: string;

  /**
   * Added to the element any time a draggable element is being dragged
   */
  @Input() dragActiveClass: string;

  /**
   * Called when a draggable element starts overlapping the element
   */
  @Output() dragEnter = new EventEmitter<DropEvent>();

  /**
   * Called when a draggable element stops overlapping the element
   */
  @Output() dragLeave = new EventEmitter<DropEvent>();

  /**
   * Called when a draggable element is moved over the element
   */
  @Output() dragOver = new EventEmitter<DropEvent>();

  /**
   * Called when a draggable element is dropped on this element
   */
  @Output() drop = new EventEmitter<DropEvent>(); // tslint:disable-line no-output-named-after-standard-event

  currentDragSubscription: Subscription;

  constructor(
    private element: ElementRef<HTMLElement>,
    private draggableHelper: DraggableHelper,
    private zone: NgZone,
    private renderer: Renderer2,
    @Optional() private scrollContainer: DraggableScrollContainerDirective
  ) {}

  ngOnInit() {
    this.currentDragSubscription = this.draggableHelper.currentDrag.subscribe(
      drag$ => {
        this.renderer.addClass(
          this.element.nativeElement,
          this.dragActiveClass
        );
        const droppableRectangle: {
          cache?: ClientRect;
          updateCache: boolean;
        } = {
          updateCache: true
        };

        const deregisterScrollListener = this.renderer.listen(
          this.scrollContainer
            ? this.scrollContainer.elementRef.nativeElement
            : 'window',
          'scroll',
          () => {
            droppableRectangle.updateCache = true;
          }
        );

        let currentDragDropData: any;
        let currentMousePosition: OffsetEvent;

        const overlaps$ = drag$.pipe(
          map(({ clientX, clientY, dropData }) => {
            currentDragDropData = dropData;

            if (droppableRectangle.updateCache) {
              droppableRectangle.cache = this.element.nativeElement.getBoundingClientRect();

              droppableRectangle.updateCache = false;
            }

            currentMousePosition = {
              x: clientX - (droppableRectangle.cache as ClientRect).left,
              y: clientY - (droppableRectangle.cache as ClientRect).top
            };

            return isCoordinateWithinRectangle(
              clientX,
              clientY,
              droppableRectangle.cache as ClientRect
            );
          })
        );

        const overlapsChanged$ = overlaps$.pipe(distinctUntilChanged());

        let dragOverActive: boolean; // TODO - see if there's a way of doing this via rxjs

        overlapsChanged$
          .pipe(filter(overlapsNow => overlapsNow))
          .subscribe(() => {
            dragOverActive = true;
            this.renderer.addClass(
              this.element.nativeElement,
              this.dragOverClass
            );
            this.zone.run(() => {
              this.dragEnter.next({
                dropData: currentDragDropData,
                offset: currentMousePosition
              });
            });
          });

        overlaps$.pipe(filter(overlapsNow => overlapsNow)).subscribe(() => {
          this.zone.run(() => {
            this.dragOver.next({
              dropData: currentDragDropData,
              offset: currentMousePosition
            });
          });
        });

        overlapsChanged$
          .pipe(
            pairwise(),
            filter(([didOverlap, overlapsNow]) => didOverlap && !overlapsNow)
          )
          .subscribe(() => {
            dragOverActive = false;
            this.renderer.removeClass(
              this.element.nativeElement,
              this.dragOverClass
            );
            this.zone.run(() => {
              this.dragLeave.next({
                dropData: currentDragDropData,
                offset: currentMousePosition
              });
            });
          });

        drag$.subscribe({
          complete: () => {
            deregisterScrollListener();

            this.renderer.removeClass(
              this.element.nativeElement,
              this.dragActiveClass
            );
            if (dragOverActive) {
              this.renderer.removeClass(
                this.element.nativeElement,
                this.dragOverClass
              );
              this.zone.run(() => {
                this.drop.next({
                  dropData: currentDragDropData,
                  offset: currentMousePosition
                });
              });
            }
          }
        });
      }
    );
  }

  ngOnDestroy() {
    if (this.currentDragSubscription) {
      this.currentDragSubscription.unsubscribe();
    }
  }
}
