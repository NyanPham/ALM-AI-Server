import { hostContext } from "../config/State.js";
import { IBM_XML_TAG_NAMES, IBM_XML_TAG_ATTRS } from "../config/constants.js";
import { domParser, getTags, getTag, toXml, xmlSerializer } from "../utils/helper.js";
import Artifact from "./Artifact.js";

const TRANSLATE_ATTR_NAME = "H_Translate";
const STRING_DATA_TYPE_RDF_URI = "http://www.w3.org/2001/XMLSchema#string";

const RDF_VALUE_LITERAL_TAGNAME = "rdf:value";
const ID_FIELD_SEPERATOR = "--ID--";

const IMMUTABLE_SYS_ATTRS = new Map([
  ["http://purl.org/dc/terms/creator", true],
  ["http://purl.org/dc/terms/identifier", true],
  ["http://purl.org/dc/terms/created", true],
  ["http://purl.org/dc/terms/modified", true],
  ["http://purl.org/dc/terms/contributor", true],
]);

class ArtifactWithAI extends Artifact {
  constructor({ id, url, rawBaseArtXml, projectId, configURI, configPreset, changesetURL, artTypesMap, componentUrlInProject }) {
    super(null, projectId, configURI, configPreset, changesetURL);

    this.id = id;
    this.url = url;
    this.rawBaseArtXml = rawBaseArtXml;
    this.componentUrlInProject = componentUrlInProject;
    this.artTypesMap = artTypesMap;

    this.initTypeAndPrimaryText();
  }

  initTypeAndPrimaryText() {
    if (this.rawBaseArtXml) {
      const baseArtXml = domParser.parseFromString(this.rawBaseArtXml, "application/xml");
      const primaryTextTag = getTags(RDF_VALUE_LITERAL_TAGNAME, baseArtXml.documentElement).find((valueRdf) => valueRdf.getAttribute("rdf:parseType") === "Literal");

      // this.baseUrl = getTag(IBM_XML_TAG_NAMES.rm.artifact, baseArtXml)?.getAttribute(IBM_XML_TAG_ATTRS.about)
      this.primaryText = primaryTextTag != null ? primaryTextTag.textContent : null;
      this.type = this.artTypesMap.get(getTag(IBM_XML_TAG_NAMES.rm.ofType, baseArtXml)?.getAttribute(IBM_XML_TAG_ATTRS.resource))?.type;
    } else {
      this.primaryText = null;
    }
  }

  prepareTextForPrompt() {
    if (this.primaryText == null) return "";

    return `${ID_FIELD_SEPERATOR}${this.id}${ID_FIELD_SEPERATOR}${this.primaryText.trim()}`;
  }

  prepareSingleText() {
    return `Requirement: ${this.primaryText.trim()}`;
  }

  async fetchRmArtifactXml({ withChangeset = false, getEtag = false } = null) {
    let multiRequestTxt = `
        <rdf:RDF
            xmlns:rrm="http://www.ibm.com/xmlns/rrm/1.0/"
            xmlns:rrmMulti="http://com.ibm.rdm/multi-request#"
            xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
            <rrmMulti:MultiRequest rdf:about="${this.url}">
                <rrmMulti:httpHeader rdf:parseType="Resource">
                    <rrmMulti:httpHeaderValue>text/plain</rrmMulti:httpHeaderValue>
                    <rrmMulti:httpHeaderName>Content-Type</rrmMulti:httpHeaderName>
                </rrmMulti:httpHeader>
                <rrmMulti:httpHeader rdf:parseType="Resource">
                    <rrmMulti:httpHeaderValue>none</rrmMulti:httpHeaderValue>
                    <rrmMulti:httpHeaderName>Accept</rrmMulti:httpHeaderName>
                </rrmMulti:httpHeader>
                <rrmMulti:httpHeader rdf:parseType="Resource">
                    <rrmMulti:httpHeaderValue>private</rrmMulti:httpHeaderValue>
                    <rrmMulti:httpHeaderName>DoorsRP-Request-Type</rrmMulti:httpHeaderName>
                </rrmMulti:httpHeader>
                <rrmMulti:httpHeader rdf:parseType="Resource">
                    <rrmMulti:httpHeaderValue>${this.changesetURL}</rrmMulti:httpHeaderValue>
                    <rrmMulti:httpHeaderName>${this.configPreset}</rrmMulti:httpHeaderName>
                </rrmMulti:httpHeader>
                <rrmMulti:httpHeader rdf:parseType="Resource">
                    <rrmMulti:httpHeaderValue>${this.componentUrlInProject}</rrmMulti:httpHeaderValue>
                    <rrmMulti:httpHeaderName>net.jazz.jfs.owning-context</rrmMulti:httpHeaderName>
                </rrmMulti:httpHeader>
                <rrmMulti:httpMethod>GET</rrmMulti:httpMethod>
            </rrmMulti:MultiRequest>
        </rdf:RDF> `;

    const url = `${hostContext}/multi-request`;
    const fetchConfig = {
      headers: {
        Accept: "None",
        "Content-Type": "text/plain",
        "DoorsRP-Request-Type": "private",
        "net.jazz.jfs.owning-context": this.componentUrlInProject,
        [this.configPreset]: this.changesetURL,
      },
      method: "POST",
      body: multiRequestTxt,
    };

    const res = await fetch(url, fetchConfig);
    const text = await res.text();
    const xml = toXml(text);

    const eTagHeader = getTags("rrmMulti:httpHeader", xml).find((httpHeader) => getTag("rrmMulti:httpHeaderName", httpHeader)?.textContent.toLowerCase() === "etag");

    const regex = /"([^"]+)"/;
    const etag = `"${getTag("rrmMulti:httpHeaderValue", eTagHeader)?.textContent.match(regex)?.[1]}"`;

    const responseContent = getTag("rrmMulti:responseContent", xml).textContent;
    const rdfSection = responseContent.match(/<rdf:RDF[^>]*>[\s\S]*<\/rdf:RDF>/);

    const artifactXml = toXml(rdfSection[0]);

    return { etag, artifactXml };
  }

  findOrCreateRmHasAttrVal(attrResourceUrl, container, artifactXml, dataType) {
    let tag = getTags(IBM_XML_TAG_NAMES.rm.hasAttrVal, container).find((tag) => {
      return getTag(IBM_XML_TAG_NAMES.rm.hasAttrDef, tag)?.getAttribute(IBM_XML_TAG_ATTRS.resource) === attrResourceUrl;
    });

    if (tag == null) {
      tag = artifactXml.createElement(IBM_XML_TAG_NAMES.rm.hasAttrVal);
      tag.setAttribute(IBM_XML_TAG_ATTRS.parseType, "Resource");

      const rdfValue = artifactXml.createElement(IBM_XML_TAG_NAMES.rdfValue);
      rdfValue.setAttribute("rdf:datatype", dataType);
      tag.appendChild(rdfValue);

      const rmHasAttrDef = artifactXml.createElement(IBM_XML_TAG_NAMES.rm.hasAttrDef);
      rmHasAttrDef.setAttribute(IBM_XML_TAG_ATTRS.resource, attrResourceUrl);
      tag.appendChild(rmHasAttrDef);

      container.appendChild(tag);
    }

    return tag;
  }

  removeDsArtifactXmlSysAttributes(artifactXml) {
    const container = getTag(IBM_XML_TAG_NAMES.rm.artifact, artifactXml.documentElement);

    if (!container) return -1;

    getTags(IBM_XML_TAG_NAMES.rm.hasAttrVal, container).forEach((hasAttrValEntry) => {
      const attrDefResource = getTag(IBM_XML_TAG_NAMES.rm.hasAttrDef, hasAttrValEntry)?.getAttribute(IBM_XML_TAG_ATTRS.resource);

      if (IMMUTABLE_SYS_ATTRS.has(attrDefResource)) {
        hasAttrValEntry.remove();
      }
    });
  }

  async updateThisArtifact(newArtifactXml, etag) {
    if (this.changesetURL == null) {
      alert("Something is wrong with the changeset! The transfer is blocked automatically!");
      return false;
    }

    this.removeDsArtifactXmlSysAttributes(newArtifactXml);

    const updateOptions = {
      headers: {
        Accept: "None",
        "Content-Type": "application/rdf+xml",
        "DoorsRP-Request-Type": "private",
        "net.jazz.jfs.owning-context": this.componentUrlInProject,
        [this.configPreset]: this.changesetURL,
        "If-Match": etag,
      },
      method: "PUT",
      body: xmlSerializer.serializeToString(newArtifactXml),
    };

    const updateRes = await fetch(this.url, updateOptions);

    if (!updateRes.ok && updateRes.status == 412 && updateRes.statusText === "Precondition Failed") {
      return false;
    } else if (!updateRes.ok) {
      const text = await updateRes.text();
      console.error(text);

      return false;
    } else {
    }

    return true;
  }

  async updateAttribute({ attrResourceUrl, dataType = STRING_DATA_TYPE_RDF_URI, value }) {
    const { artifactXml, etag } = await this.fetchRmArtifactXml({ withChangeset: true, getEtag: true });
    const container = getTag(IBM_XML_TAG_NAMES.rm.artifact, artifactXml);
    const attrTag = this.findOrCreateRmHasAttrVal(attrResourceUrl, container, artifactXml, dataType);

    const rdfValue = getTag(IBM_XML_TAG_NAMES.rdfValue, attrTag);
    rdfValue.textContent = value;

    return await this.updateThisArtifact(artifactXml, etag);
  }
}

export default ArtifactWithAI;
