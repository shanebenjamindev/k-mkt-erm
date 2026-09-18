import { Fragment } from "react";

const urlPattern = /(https?:\/\/[^\s<>]+|www\.[^\s<>]+)/gi;

export function LinkifiedText({ text }: { text: string }) {
  return <>{text.split("\n").map((line, lineIndex) => <Fragment key={lineIndex}>{linkify(line)}{lineIndex < text.split("\n").length - 1 ? <br /> : null}</Fragment>)}</>;
}

function linkify(text: string) {
  const parts = text.split(urlPattern);
  return parts.map((part, index) => {
    if (!part || !/^https?:\/\//i.test(part) && !/^www\./i.test(part)) return <Fragment key={index}>{part}</Fragment>;
    const { url, suffix } = trimUrlSuffix(part);
    const href = url.startsWith("www.") ? `https://${url}` : url;
    return <Fragment key={index}><a className="brief-link" href={href} target="_blank" rel="noreferrer noopener" onClick={(event) => event.stopPropagation()}>{url}</a>{suffix}</Fragment>;
  });
}

function trimUrlSuffix(value: string) {
  const match = value.match(/^(.*?)([),.!?;:]*)$/);
  return { url: match?.[1] ?? value, suffix: match?.[2] ?? "" };
}
