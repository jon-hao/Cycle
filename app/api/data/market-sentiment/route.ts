import getConfig from "@/common/configs";
import { Domain, Platform } from "@/common/constants/serviceEnum";
import { fetchData } from "@/common/helpers/requestHelper";

const config = getConfig(Domain.Data, Platform.CNN);

export const GET = async (request: Request) => {
  try {
      const { marketSentiment: { url } } = config;
      const result = await fetchData(url, { isEmulateBrowser: true });
      const currentFearGreed = {
        score: result['fear_and_greed'].score,
        rating: result['fear_and_greed'].rating
      };
      const fearGreedTrends = result['fear_and_greed_historical'].data.map(({ x, y, rating }) => ({
        timestamp: x,
        score: y,
        rating
      }));
      const data = {
        currentFearGreed,
        fearGreedTrends
      }
      return Response.json(data);
    } catch(e) {
      return null
    }
}