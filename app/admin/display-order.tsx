"use client";
import { useState } from "react";
export default function DisplayOrder({ pinned = false, order, disabled, onSave }: {
  pinned?: boolean; order?: number; disabled: boolean; onSave(value: { pinned: boolean; order?: number }): void;
}) {
  const [pin, setPin] = useState(pinned), [position, setPosition] = useState(order === undefined ? "" : String(order));
  const valid = position === "" || /^\d{1,6}$/.test(position);
  return <details className="writer-display-order"><summary>Pin & display order</summary>
    <p className="writer-help">Pinned articles come first. Smaller numbers appear earlier; leave blank for the default order. Applies to both saved languages in this category. No translation. Save or discard writing edits first.</p>
    <label className="writer-trash-option"><input type="checkbox" checked={pin} disabled={disabled} onChange={event => setPin(event.target.checked)} /> Pin to top</label>
    <label className="writer-label">Display order<input type="number" min={0} max={999999} step={1} value={position} disabled={disabled} placeholder="Default" onChange={event => setPosition(event.target.value)} /></label>
    {!valid && <p role="alert">Use a whole number from 0 to 999999.</p>}
    <button disabled={disabled || !valid} onClick={() => onSave({ pinned: pin, ...(position !== "" ? { order: Number(position) } : {}) })}>Save display order</button>
  </details>;
}
