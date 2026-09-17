export function ConnectModal({
  open,
  code,
  lanUrls,
  onClose,
}: {
  open: boolean;
  code: string;
  lanUrls: string[];
  onClose: () => void;
}) {
  if (!open) return null;
  const share = `${location.origin}/?room=${code}`;
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Devices</h2>
        <div className="code-box">
          <div className="meta">Code</div>
          <div className="room-code">{code}</div>
          <button className="copy" onClick={() => navigator.clipboard.writeText(code)}>
            Copy
          </button>
        </div>
        <div className="lan-box">
          <div className="meta">Link</div>
          <code>{share}</code>
          <button className="copy" onClick={() => navigator.clipboard.writeText(share)}>
            Copy
          </button>
        </div>
        {lanUrls.length ? (
          <div className="lan-box">
            <div className="meta">LAN</div>
            {lanUrls.map((url) => (
              <div key={url}>
                <code>{url}</code>
              </div>
            ))}
          </div>
        ) : null}
        <button className="btn btn-ghost" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
