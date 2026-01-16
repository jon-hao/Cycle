'use client'

import { useDeferredValue, useEffect, useState } from "react";
import { TRequest, fetchData } from "@jon-hao/ahkite";

const useQuery = (endpoint: string, option?: TRequest): [data: any, { fetchData: () => Promise<void>, loading: boolean, firstLoading: boolean }] => {
  const [originData, setData] = useState(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [firstLoading, setFirstLoading] = useState<boolean>(true);
  const data = useDeferredValue(originData);

  const fetchOriginData = async () => {
    setLoading(true);
    const result = await fetchData(endpoint, option);
    setData(result);
    setLoading(false);
    if (firstLoading) {
      setFirstLoading(false)
    }
  }

  useEffect(() => {
    fetchOriginData();
  }, [])

  return [data, { fetchData: fetchOriginData, loading, firstLoading }]
}

export default useQuery;
