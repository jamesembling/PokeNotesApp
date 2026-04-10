"use client";

import { useEffect } from "react";

type LockedStyles = {
  overflow: string;
  position: string;
  top: string;
  left: string;
  right: string;
  width: string;
  overscrollBehavior: string;
};

let activeLockCount = 0;
let lockedScrollY = 0;
let bodyStyles: LockedStyles | null = null;
let htmlStyles: Pick<LockedStyles, "overflow" | "overscrollBehavior"> | null = null;

function lockBodyScroll() {
  if (typeof document === "undefined") {
    return;
  }

  activeLockCount += 1;
  if (activeLockCount > 1) {
    return;
  }

  lockedScrollY = window.scrollY;

  bodyStyles = {
    overflow: document.body.style.overflow,
    position: document.body.style.position,
    top: document.body.style.top,
    left: document.body.style.left,
    right: document.body.style.right,
    width: document.body.style.width,
    overscrollBehavior: document.body.style.overscrollBehavior
  };

  htmlStyles = {
    overflow: document.documentElement.style.overflow,
    overscrollBehavior: document.documentElement.style.overscrollBehavior
  };

  document.body.style.overflow = "hidden";
  document.body.style.position = "fixed";
  document.body.style.top = `-${lockedScrollY}px`;
  document.body.style.left = "0";
  document.body.style.right = "0";
  document.body.style.width = "100%";
  document.body.style.overscrollBehavior = "none";

  document.documentElement.style.overflow = "hidden";
  document.documentElement.style.overscrollBehavior = "none";
}

function unlockBodyScroll() {
  if (typeof document === "undefined" || activeLockCount === 0) {
    return;
  }

  activeLockCount -= 1;
  if (activeLockCount > 0) {
    return;
  }

  if (bodyStyles) {
    document.body.style.overflow = bodyStyles.overflow;
    document.body.style.position = bodyStyles.position;
    document.body.style.top = bodyStyles.top;
    document.body.style.left = bodyStyles.left;
    document.body.style.right = bodyStyles.right;
    document.body.style.width = bodyStyles.width;
    document.body.style.overscrollBehavior = bodyStyles.overscrollBehavior;
  }

  if (htmlStyles) {
    document.documentElement.style.overflow = htmlStyles.overflow;
    document.documentElement.style.overscrollBehavior = htmlStyles.overscrollBehavior;
  }

  window.scrollTo(0, lockedScrollY);
}

export function useBodyScrollLock(isLocked: boolean) {
  useEffect(() => {
    if (!isLocked) {
      return;
    }

    lockBodyScroll();
    return () => {
      unlockBodyScroll();
    };
  }, [isLocked]);
}
