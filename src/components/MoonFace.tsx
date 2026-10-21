// The sleepy crescent moon (hush's mascot), as a still picture. The play button animates it.
import { SvgXml } from "react-native-svg";

const BODY = '<path d="M98 22a58 58 0 1 0 30 78A48 48 0 0 1 98 22z" fill="#ffd68c"/><ellipse cx="48" cy="94" rx="7" ry="4.5" fill="#ff9db0" opacity=".85"/><ellipse cx="96" cy="102" rx="7" ry="4.5" fill="#ff9db0" opacity=".85"/><circle cx="122" cy="34" r="4.5" fill="#c9bfff"/><circle cx="134" cy="52" r="2.6" fill="#c9bfff"/>';
const ASLEEP = '<path d="M50 78q7 6 14 0" stroke="#5b4320" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M78 86q7 6 14 0" stroke="#5b4320" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M66 104q5 4 10 1" stroke="#5b4320" stroke-width="3.5" fill="none" stroke-linecap="round"/>';
const AWAKE = '<circle cx="57" cy="79" r="6" fill="#5b4320"/><circle cx="85" cy="87" r="6" fill="#5b4320"/><circle cx="59" cy="77" r="2" fill="#fff"/><circle cx="87" cy="85" r="2" fill="#fff"/><ellipse cx="71" cy="106" rx="5" ry="4" fill="#5b4320"/>';

export const MOON_FACE = `<svg viewBox="0 0 150 150">${BODY}${ASLEEP}</svg>`;

export function MoonFace({ size = 96, awake }: { size?: number; awake?: boolean }) {
  return <SvgXml width={size} height={size} xml={`<svg viewBox="0 0 150 150">${BODY}${awake ? AWAKE : ASLEEP}</svg>`} />;
}
