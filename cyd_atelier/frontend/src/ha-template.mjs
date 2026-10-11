// A cursor and a character budget keep even large HA installations exportable.
export const COFFEE_ENTITIES = [
  'sensor.kaffee_status',
  'sensor.kaffee_laufende_dauer',
  'binary_sensor.kaffee_is_espresso',
  'binary_sensor.kaffee_is_milchschaum',
  'sensor.kaffee_zubereitungen',
  'sensor.kaffee_espresso_heute',
  'sensor.kaffee_milchschaum_heute',
  'sensor.kaffee_cappuccino_heute'
];
export function makeHATemplate({start=0,search='',entityIds=[]}={}){
  start=Math.max(0,Math.floor(Number(start)||0));
  search=String(search).trim().slice(0,100);
  const ids=[...new Set(entityIds.map(id=>String(id).trim()).filter(id=>/^\w+\.[\w]+$/.test(id)))];
  return `{# CYD Atelier: kompakter Export. Weitere Abschnitte im Generator kopieren. #}
{%- set start = ${start} -%}
{%- set suche = ${JSON.stringify(search)} -%}
{%- set nur_entitaeten = ${JSON.stringify(ids)} -%}
{%- set anzahl = 100 -%}
{%- set ns = namespace(matches=[], rows=[], chars=0, full=false) -%}
{%- for s in states | sort(attribute='entity_id') -%}
  {%- if (not nur_entitaeten or s.entity_id in nur_entitaeten) and (not suche or suche | lower in (s.entity_id ~ ' ' ~ s.attributes.get('friendly_name', '')) | lower) -%}
    {%- set ns.matches = ns.matches + [s] -%}
  {%- endif -%}
{%- endfor -%}
{%- set total = ns.matches | count -%}
{%- set start = [start, total] | min -%}
{%- for s in ns.matches[start:start + anzahl] -%}
  {%- if not ns.full -%}
    {%- set attrs = namespace(items=[]) -%}
    {%- set primary = ['friendly_name', 'unit_of_measurement', 'device_class', 'icon'] -%}
    {%- for key in primary if key in s.attributes -%}
      {%- set attrs.items = attrs.items + [(key, (s.attributes[key] | string)[:160])] -%}
    {%- endfor -%}
    {%- for key, value in s.attributes.items() -%}
      {%- if key not in primary and key | length <= 160 and attrs.items | count < 40 -%}
        {%- if value is integer or value is float or value is boolean or value is none -%}
          {%- set attrs.items = attrs.items + [(key, value)] -%}
        {%- elif value is string or (value is not mapping and value is not iterable) -%}
          {%- set attrs.items = attrs.items + [(key, (value | string)[:160])] -%}
        {%- endif -%}
      {%- endif -%}
    {%- endfor -%}
    {%- set row = dict(entity_id=s.entity_id, state=(s.state | string)[:160], attributes=dict(attrs.items)) | to_json(ensure_ascii=false) -%}
    {%- if ns.chars + row | length < 120000 -%}
      {%- set ns.rows = ns.rows + [row] -%}
      {%- set ns.chars = ns.chars + (row | length) + 1 -%}
    {%- else -%}
      {%- set ns.full = true -%}
    {%- endif -%}
  {%- endif -%}
{%- endfor -%}
{%- set next_start = start + (ns.rows | count) -%}
{"cyd_import":1,"start":{{ start }},"total":{{ total }},"search":{{ suche | to_json }},"next_start":{{ next_start if next_start < total else 'null' }},"entities":[{{ ns.rows | join(',') }}]}`;
}
export const HA_TEMPLATE=makeHATemplate({entityIds:COFFEE_ENTITIES});
