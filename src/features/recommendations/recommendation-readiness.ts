import { listInstalledDatasets } from '../../datasets/datasetRegistry';
import { listEnabledUserRecipesWithLibraries } from '../../db/userRecipesRepository';
import { hasAiDataConsent } from '../../privacy/ai-data-consent';
import { getActiveEmbeddingModel } from '../../rag/model/modelRegistry';
import { hasVerifiedApiKey } from '../../storage/settingsStorage';
import {
  evaluateRecommendationReadiness,
  hasRetrievableRecipeSource,
  type RecommendationReadiness,
} from './recommendation-readiness-policy';

export type { RecommendationReadiness } from './recommendation-readiness-policy';

export async function loadRecommendationReadiness(): Promise<RecommendationReadiness> {
  const [consentReady, credentialReady, model, datasets, personalRecipes] =
    await Promise.all([
      hasAiDataConsent(),
      hasVerifiedApiKey('gemini'),
      getActiveEmbeddingModel(),
      listInstalledDatasets(),
      listEnabledUserRecipesWithLibraries(),
    ]);

  return evaluateRecommendationReadiness({
    consentReady,
    credentialReady,
    modelReady: Boolean(model?.testEmbeddingVerifiedAt),
    sourceReady: hasRetrievableRecipeSource({
      activeDatasetCount: datasets.filter((dataset) => dataset.active && dataset.status === 'installed').length,
      enabledPersonalRecipeCount: personalRecipes.length,
    }),
  });
}
