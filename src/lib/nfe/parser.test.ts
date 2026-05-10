import { describe, it, expect } from "vitest";
import { parseNFeXml, ParseNFeError } from "./parser";

const SAMPLE_NFE = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe>
    <infNFe Id="NFe35200714200166000187550010000000071000000074" versao="4.00">
      <ide>
        <cUF>35</cUF>
        <cNF>00000007</cNF>
        <natOp>VENDA DE MERCADORIA</natOp>
        <mod>55</mod>
        <serie>1</serie>
        <nNF>7</nNF>
        <dhEmi>2026-04-15T10:30:00-03:00</dhEmi>
        <tpNF>1</tpNF>
        <tpAmb>1</tpAmb>
      </ide>
      <emit>
        <CNPJ>14200166000187</CNPJ>
        <xNome>FORNECEDOR EXEMPLO LTDA</xNome>
        <IE>123456789</IE>
        <enderEmit>
          <UF>SP</UF>
        </enderEmit>
      </emit>
      <dest>
        <CNPJ>11222333000181</CNPJ>
        <xNome>NOSSO CLIENTE LTDA</xNome>
      </dest>
      <det nItem="1">
        <prod>
          <cProd>P001</cProd>
          <xProd>PARAFUSO M6 X 20</xProd>
          <NCM>73181500</NCM>
          <CFOP>5102</CFOP>
          <uCom>UN</uCom>
          <qCom>100.0000</qCom>
          <vUnCom>0.5000</vUnCom>
          <vProd>50.00</vProd>
        </prod>
        <imposto>
          <PIS>
            <PISAliq>
              <CST>01</CST>
              <pPIS>1.65</pPIS>
              <vPIS>0.83</vPIS>
            </PISAliq>
          </PIS>
          <COFINS>
            <COFINSAliq>
              <CST>01</CST>
              <pCOFINS>7.60</pCOFINS>
              <vCOFINS>3.80</vCOFINS>
            </COFINSAliq>
          </COFINS>
        </imposto>
      </det>
      <det nItem="2">
        <prod>
          <cProd>P002</cProd>
          <xProd>BRINDE PROMOCIONAL</xProd>
          <NCM>49019900</NCM>
          <CFOP>5910</CFOP>
          <uCom>UN</uCom>
          <qCom>1.0000</qCom>
          <vUnCom>10.0000</vUnCom>
          <vProd>10.00</vProd>
        </prod>
        <imposto>
          <PIS>
            <PISNT>
              <CST>06</CST>
            </PISNT>
          </PIS>
          <COFINS>
            <COFINSNT>
              <CST>06</CST>
            </COFINSNT>
          </COFINS>
        </imposto>
      </det>
      <total>
        <ICMSTot>
          <vProd>60.00</vProd>
          <vDesc>0.00</vDesc>
          <vFrete>0.00</vFrete>
          <vICMS>10.80</vICMS>
          <vPIS>0.83</vPIS>
          <vCOFINS>3.80</vCOFINS>
          <vNF>60.00</vNF>
        </ICMSTot>
      </total>
    </infNFe>
  </NFe>
  <protNFe>
    <infProt>
      <cStat>100</cStat>
      <nProt>135200000000074</nProt>
    </infProt>
  </protNFe>
</nfeProc>`;

describe("parseNFeXml", () => {
  it("extrai campos principais de um procNFe valido", () => {
    const parsed = parseNFeXml(SAMPLE_NFE);
    expect(parsed.chaveAcesso).toBe(
      "35200714200166000187550010000000071000000074",
    );
    expect(parsed.modelo).toBe("55");
    expect(parsed.serie).toBe(1);
    expect(parsed.numero).toBe(7);
    expect(parsed.ambiente).toBe(1);
    expect(parsed.naturezaOperacao).toBe("VENDA DE MERCADORIA");
    expect(parsed.status).toBe("autorizada");
    expect(parsed.protocolo).toBe("135200000000074");
    expect(parsed.emitente.cnpj).toBe("14200166000187");
    expect(parsed.emitente.nome).toBe("FORNECEDOR EXEMPLO LTDA");
    expect(parsed.emitente.uf).toBe("SP");
    expect(parsed.destinatario.cnpjCpf).toBe("11222333000181");
  });

  it("extrai itens com CST de PIS/COFINS preservados", () => {
    const parsed = parseNFeXml(SAMPLE_NFE);
    expect(parsed.itens).toHaveLength(2);
    expect(parsed.itens[0]?.codigo).toBe("P001");
    expect(parsed.itens[0]?.ncm).toBe("73181500");
    expect(parsed.itens[0]?.cfop).toBe("5102");
    expect(parsed.itens[0]?.pisCst).toBe("01");
    expect(parsed.itens[0]?.cofinsCst).toBe("01");
    expect(parsed.itens[1]?.pisCst).toBe("06");
    expect(parsed.itens[1]?.cofinsCst).toBe("06");
  });

  it("calcula totais", () => {
    const parsed = parseNFeXml(SAMPLE_NFE);
    expect(parsed.totais.produtos).toBe(60);
    expect(parsed.totais.icms).toBe(10.8);
    expect(parsed.totais.pis).toBeCloseTo(0.83);
    expect(parsed.totais.cofins).toBeCloseTo(3.8);
    expect(parsed.totais.nota).toBe(60);
  });

  it("gera SHA-256 estavel do xml bruto", () => {
    const a = parseNFeXml(SAMPLE_NFE);
    const b = parseNFeXml(SAMPLE_NFE);
    expect(a.xmlSha256).toBe(b.xmlSha256);
    expect(a.xmlSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejeita XML sem chave de acesso", () => {
    const invalid = `<?xml version="1.0"?><NFe><infNFe versao="4.00"><ide></ide></infNFe></NFe>`;
    expect(() => parseNFeXml(invalid)).toThrow(ParseNFeError);
  });

  it("rejeita XML com CNPJ de emitente invalido", () => {
    const invalid = SAMPLE_NFE.replace(
      "<CNPJ>14200166000187</CNPJ>",
      "<CNPJ>123</CNPJ>",
    );
    expect(() => parseNFeXml(invalid)).toThrow(ParseNFeError);
  });
});
