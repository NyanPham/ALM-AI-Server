export function createAndFilterArtifactAIs(arts, filterCb, { projectId, configPreset, artTypesMap, configURI, changesetURL, component }) {
  return arts
    .map(
      (art) =>
        new ArtifactWithAI({
          id: art.id,
          url: art.uri,
          rawBaseArtXml: art[BOUND_ARTIFACT_OBJ],
          projectId,
          configURI,
          configPreset,
          changesetURL,
          artTypesMap,
          componentUrlInProject: component.urlInProject,
        })
    )
    .filter(filterCb);
}
