function rectangle(element) {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    left: rect.left,
  };
}

function isVisible(element) {
  const style = element.ownerDocument.defaultView.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    Number(style.opacity) > 0 &&
    rect.width > 0 &&
    rect.height > 0
  );
}

function overlaps(a, b) {
  return !(
    a.right <= b.left ||
    a.left >= b.right ||
    a.bottom <= b.top ||
    a.top >= b.bottom
  );
}

function textRectangleBefore(container, target) {
  const range = container.ownerDocument.createRange();
  range.setStart(container, 0);
  range.setEndBefore(target);
  const rectangles = [...range.getClientRects()].filter(
    (rect) => rect.width > 0 && rect.height > 0,
  );
  const rect = rectangles.at(-1);
  return rect
    ? {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
      }
    : null;
}

function checkComputed(style, expected, label, failures) {
  const observed = {};
  for (const [property, rule] of Object.entries(expected ?? {})) {
    const value = style.getPropertyValue(property).trim();
    observed[property] = value;
    if (typeof rule === "string" && value !== rule) {
      failures.push(`${label}: ${property} expected ${rule}, observed ${value}`);
    } else if (rule?.equals != null && value !== rule.equals) {
      failures.push(
        `${label}: ${property} expected ${rule.equals}, observed ${value}`,
      );
    } else if (rule?.notEquals != null && value === rule.notEquals) {
      failures.push(`${label}: ${property} must not equal ${rule.notEquals}`);
    } else if (rule?.oneOf && !rule.oneOf.includes(value)) {
      failures.push(
        `${label}: ${property} expected one of ${rule.oneOf.join(", ")}, observed ${value}`,
      );
    }
  }
  return observed;
}

function verifySelector(document, assertion, failures) {
  const elements = [...document.querySelectorAll(assertion.selector)];
  const minimum = assertion.minMatches ?? 1;
  const maximum = assertion.maxMatches ?? Number.POSITIVE_INFINITY;
  if (elements.length < minimum || elements.length > maximum) {
    failures.push(
      `${assertion.name}: expected ${minimum}-${Number.isFinite(maximum) ? maximum : "any"} matches, observed ${elements.length}`,
    );
  }

  const samples = elements.map((element, index) => {
    const style = element.ownerDocument.defaultView.getComputedStyle(element);
    const visible = isVisible(element);
    const rect = rectangle(element);
    if (assertion.visible !== false && !visible) {
      failures.push(`${assertion.name}[${index}] is not visible`);
    }
    if (
      assertion.pointerUsable &&
      (style.pointerEvents === "none" || rect.width < 1 || rect.height < 1)
    ) {
      failures.push(`${assertion.name}[${index}] is not pointer-usable`);
    }
    return {
      visible,
      pointerEvents: style.pointerEvents,
      rectangle: rect,
      computed: checkComputed(
        style,
        assertion.computed,
        `${assertion.name}[${index}]`,
        failures,
      ),
    };
  });

  return {
    name: assertion.name,
    selector: assertion.selector,
    matchCount: elements.length,
    samples,
  };
}

function verifyGeometry(document, check, failures) {
  const containers = [...document.querySelectorAll(check.within)];
  let checked = 0;
  const observations = [];

  for (const [index, container] of containers.entries()) {
    const target = container.querySelector(check.target);
    const neighbor = check.neighbor
      ? container.querySelector(check.neighbor)
      : null;
    const textContainer =
      check.textContainer === ":scope"
        ? container
        : check.textContainer
          ? container.querySelector(check.textContainer)
          : null;
    if (!target) continue;

    if (check.kind === "inline-after-text") {
      if (!textContainer) continue;
      const targetRect = rectangle(target);
      const textRect = textRectangleBefore(textContainer, target);
      if (!textRect) continue;
      checked += 1;
      const gap = targetRect.left - textRect.right;
      const endGap = rectangle(textContainer).right - targetRect.right;
      const sameLine =
        targetRect.top < textRect.bottom && targetRect.bottom > textRect.top;
      const overlap = overlaps(targetRect, textRect);
      observations.push({
        index,
        gap,
        endGap,
        sameLine,
        overlap,
        target: targetRect,
        precedingText: textRect,
      });
      if (!sameLine) {
        failures.push(
          `${check.name}: target is not on the same line as preceding text in container ${index}`,
        );
      }
      if (gap < (check.minGap ?? 0)) {
        failures.push(
          `${check.name}: container ${index} inline gap ${gap.toFixed(2)}px is below ${check.minGap ?? 0}px`,
        );
      }
      if (gap > (check.maxGap ?? Number.POSITIVE_INFINITY)) {
        failures.push(
          `${check.name}: container ${index} inline gap ${gap.toFixed(2)}px exceeds ${check.maxGap}px`,
        );
      }
      if (
        Math.abs(endGap) >
        (check.maxEndGap ?? Number.POSITIVE_INFINITY)
      ) {
        failures.push(
          `${check.name}: container ${index} absolute end gap ${Math.abs(endGap).toFixed(2)}px exceeds ${check.maxEndGap}px`,
        );
      }
      if (check.noOverlap !== false && overlap) {
        failures.push(
          `${check.name}: target overlaps preceding text in container ${index}`,
        );
      }
      continue;
    }

    if (check.kind === "after-text") {
      if (!textContainer) continue;
      const targetRect = rectangle(target);
      const textRect = textRectangleBefore(textContainer, target);
      if (!textRect) continue;
      checked += 1;
      const gap = targetRect.top - textRect.bottom;
      const endGap = rectangle(textContainer).right - targetRect.right;
      const overlap = overlaps(targetRect, textRect);
      observations.push({
        index,
        gap,
        endGap,
        overlap,
        target: targetRect,
        precedingText: textRect,
      });
      if (gap < (check.minGap ?? 0)) {
        failures.push(
          `${check.name}: container ${index} text gap ${gap.toFixed(2)}px is below ${check.minGap ?? 0}px`,
        );
      }
      if (Math.abs(endGap) > (check.maxEndGap ?? Number.POSITIVE_INFINITY)) {
        failures.push(
          `${check.name}: container ${index} absolute end gap ${Math.abs(endGap).toFixed(2)}px exceeds ${check.maxEndGap}px`,
        );
      }
      if (check.noOverlap !== false && overlap) {
        failures.push(
          `${check.name}: target overlaps preceding text in container ${index}`,
        );
      }
      continue;
    }

    if (!neighbor) continue;
    checked += 1;
    const targetRect = rectangle(target);
    const neighborRect = rectangle(neighbor);
    const gap = targetRect.top - neighborRect.bottom;
    const overlap = overlaps(targetRect, neighborRect);
    observations.push({ index, gap, overlap, target: targetRect, neighbor: neighborRect });

    if (check.kind === "below" && gap < (check.minGap ?? 0)) {
      failures.push(
        `${check.name}: container ${index} gap ${gap.toFixed(2)}px is below ${check.minGap ?? 0}px`,
      );
    }
    if (check.noOverlap !== false && overlap) {
      failures.push(`${check.name}: target overlaps neighbor in container ${index}`);
    }
  }

  if (checked < (check.minMatches ?? 1)) {
    failures.push(
      `${check.name}: expected at least ${check.minMatches ?? 1} comparable containers, observed ${checked}`,
    );
  }
  return { name: check.name, kind: check.kind, checked, observations };
}

export function verifyDocument({ document, assertions, state, runtimeErrors = [] }) {
  const failures = [];
  const inconclusive = [];
  const selectorResults = [];
  const geometryResults = [];

  if (assertions.schemaVersion !== 1) {
    inconclusive.push("Unsupported assertion schema version.");
  }

  try {
    for (const assertion of assertions.selectors ?? []) {
      selectorResults.push(verifySelector(document, assertion, failures));
    }
    for (const check of assertions.geometry ?? []) {
      geometryResults.push(verifyGeometry(document, check, failures));
    }
  } catch (error) {
    inconclusive.push(error instanceof Error ? error.message : String(error));
  }

  if (runtimeErrors.length) {
    failures.push(`${runtimeErrors.length} relevant runtime error(s) occurred.`);
  }

  const status = inconclusive.length
    ? "inconclusive"
    : failures.length
      ? "fail"
      : "pass";

  return {
    schemaVersion: 1,
    type: "houndo.verify.complete",
    complete: true,
    status,
    issueId: state.issueId,
    captureId: state.captureId,
    query: state.query,
    renderer: state.renderer,
    viewport: state.viewport,
    hashes: state.hashes,
    verifiedAt: new Date().toISOString(),
    failures,
    inconclusive,
    runtimeErrors,
    selectors: selectorResults,
    geometry: geometryResults,
  };
}
