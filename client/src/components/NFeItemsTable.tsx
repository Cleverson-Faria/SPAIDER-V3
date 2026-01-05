import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { translateField } from "@/lib/fieldTranslations";
import { TaxComparisonTable } from "./TaxComparisonTable";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface NFeItemsTableProps {
  items: any[];
}

export function NFeItemsTable({ items }: NFeItemsTableProps) {
  // Campos dos itens que não devem ser exibidos como divergência
  const excludedItemFields = [
    'brNfSourceDocumentNumber',
    'purchaseOrder',
    'notaFiscal'
  ];

  if (!items || items.length === 0) {
    return (
      <div className="text-sm text-muted-foreground p-4">
        Nenhum item disponível para comparação.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {items.map((item, index) => {
        // Filtrar campos excluídos do item
        const filteredFields = item.fields?.filter((f: any) => 
          !excludedItemFields.includes(f.field)
        ) || [];
        
        const fieldDifferences = filteredFields.filter((f: any) => !f.isIdentical).length;
        const hasTaxes = item.taxes && Object.keys(item.taxes).length > 0;
        const taxDifferences = hasTaxes 
          ? Object.values(item.taxes).filter((t: any) => t.differences?.length > 0).length 
          : 0;

        return (
          <Card key={index} className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-semibold">Item {item.itemNumber}</h4>
              <div className="flex gap-2">
                <Badge variant={fieldDifferences > 0 ? "destructive" : "default"}>
                  {fieldDifferences} diferença(s) em campos
                </Badge>
                {hasTaxes && (
                  <Badge variant={taxDifferences > 0 ? "destructive" : "default"}>
                    {taxDifferences} diferença(s) em impostos
                  </Badge>
                )}
              </div>
            </div>

            <Accordion type="single" collapsible className="w-full">
              {/* Campos do Item */}
              <AccordionItem value="fields">
                <AccordionTrigger>
                  <span className="font-medium">Campos do Item</span>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 px-4 font-medium">Campo</th>
                          <th className="text-left py-2 px-4 font-medium">Valor Referência</th>
                          <th className="text-left py-2 px-4 font-medium">Valor Novo</th>
                          <th className="text-left py-2 px-4 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredFields.map((field: any, idx: number) => (
                          <tr 
                            key={idx} 
                            className={`border-b ${!field.isIdentical ? 'bg-destructive/10' : ''}`}
                          >
                            <td className="py-2 px-4 font-medium">
                              {translateField(field.field)}
                            </td>
                            <td className="py-2 px-4">{field.originalValue || '-'}</td>
                            <td className="py-2 px-4">{field.newValue || '-'}</td>
                            <td className="py-2 px-4">
                              <Badge variant={field.isIdentical ? "default" : "destructive"}>
                                {field.isIdentical ? "Igual" : "Diferente"}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* Impostos do Item */}
              {hasTaxes && (
                <AccordionItem value="taxes">
                  <AccordionTrigger>
                    <span className="font-medium">Impostos do Item</span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <TaxComparisonTable taxes={item.taxes} />
                  </AccordionContent>
                </AccordionItem>
              )}
            </Accordion>
          </Card>
        );
      })}
    </div>
  );
}
