"use client";

import dynamic from "next/dynamic";

const TraceFlow = dynamic(() => import("./trace-flow"), { ssr: false });

export default TraceFlow;
