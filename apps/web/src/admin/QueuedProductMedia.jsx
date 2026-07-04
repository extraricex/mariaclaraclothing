import { PRODUCT_IMAGE_ACCEPT } from './newProductMedia.js';

export default function QueuedProductMedia({ images, error = '', onAdd, onRemove, onReorder, onMove }) {
  function addDroppedFiles(event) {
    const files = [...(event.dataTransfer.files || [])];
    if (!files.length) return false;
    onAdd(files);
    return true;
  }

  function dropOnPhoto(event, targetIndex) {
    event.preventDefault();
    if (addDroppedFiles(event)) return;
    const sourceIndex = Number(event.dataTransfer.getData('text/queued-image-index'));
    if (Number.isInteger(sourceIndex)) onReorder(sourceIndex, targetIndex);
  }

  return (
    <div className="mt-4">
      <div
        className="border border-dashed border-line bg-cream px-4 py-6 text-center transition-colors hover:border-ink"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          addDroppedFiles(event);
        }}
      >
        <label className="inline-flex cursor-pointer flex-col items-center gap-2 text-sm font-semibold text-ink">
          <span>Select up to 8 photos at once</span>
          <span className="text-xs font-normal text-clay">Choose multiple files or drop them here</span>
          <span className="btn-ghost !px-4 !py-2 text-xs">Add photos</span>
          <input type="file" accept={PRODUCT_IMAGE_ACCEPT} multiple hidden aria-label="Add photos" onChange={(event) => {
            onAdd([...event.target.files]);
            event.target.value = '';
          }} />
        </label>
      </div>
      {error && <p className="mt-2 text-xs text-accent-deep" role="alert">{error}</p>}

      {images.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {images.map((image, index) => (
            <figure
              key={image.previewUrl}
              data-queued-photo
              draggable
              className="group relative overflow-hidden border border-line bg-cream"
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/queued-image-index', String(index));
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => dropOnPhoto(event, index)}
            >
              <img
                src={image.previewUrl}
                alt={`Customer product preview: ${image.file.name}`}
                className="product-photo-blend aspect-[4/5] w-full object-cover"
              />
              <figcaption className="border-t border-line bg-white px-2 py-2 text-[11px] text-clay">
                <span className="block truncate font-semibold text-ink">{image.file.name}</span>
                <span className="mt-0.5 block">{index === 0 ? 'Storefront cover' : `Photo ${index + 1}`}</span>
                <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1">
                  <button type="button" className="text-action" disabled={index === 0} onClick={() => onMove(index, 'first')}>Move first</button>
                  <button type="button" className="text-action" disabled={index === 0} onClick={() => onMove(index, 'left')}>Move left</button>
                  <button type="button" className="text-action" disabled={index === images.length - 1} onClick={() => onMove(index, 'right')}>Move right</button>
                  <button type="button" className="text-action" disabled={index === images.length - 1} onClick={() => onMove(index, 'last')}>Move last</button>
                  <button type="button" className="text-action text-accent-deep" onClick={() => onRemove(index)}>Remove photo</button>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
