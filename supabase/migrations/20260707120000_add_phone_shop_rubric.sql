update rubrics
set session_type = 'phone_shop'
where session_type = 'phone_ai_shop';

with phone_shop_definition as (
  select '{
    "notes": "Score each item YES (full points) or NO (0) based on transcript evidence. Before AI training, consider: How are you going to turn this conversation into a lead? How are you going to build rapport? Turn questions about utilities into conversations about features, mandates, and locations. How are you going to provide value to capture the lead information?",
    "sections": [
      {
        "name": "Phone Shop Rubric",
        "items": [
          {
            "id": "Q110",
            "text": "Did the leasing professional ask for your contact information at the beginning of the call? (Name or phone number, email?)",
            "points": 10
          },
          {
            "id": "Q120",
            "text": "Did the leasing professional use your name during the telephone presentation?",
            "points": 5
          },
          {
            "id": "Q130",
            "text": "Did the leasing professional create a sense of urgency?",
            "points": 10
          },
          {
            "id": "Q140",
            "text": "Did the leasing professional ask how you heard about the community?",
            "points": 5
          },
          {
            "id": "Q150",
            "text": "Did the leasing professional convey a warm and inviting attitude?",
            "points": 5
          },
          {
            "id": "Q160",
            "text": "Did the leasing professional suggest a tour time and date and encourage the lead to see the property?",
            "points": 10
          },
          {
            "id": "Q170",
            "text": "Did the leasing professional create value in the property before quoting any rates or specials?",
            "points": 10
          },
          {
            "id": "Q180",
            "text": "Did the leasing professional attempt to direct close or ask for the sale at least twice?",
            "points": 10
          },
          {
            "id": "Q190",
            "text": "Did the leasing professional avoid giving the rates over the phone by price deflecting at least three times?",
            "points": 10
          },
          {
            "id": "Q200",
            "text": "Did the leasing professional take control of the call using ARP and proceed to collecting contact information?",
            "points": 5
          },
          {
            "id": "Q210",
            "text": "Did the leasing professional answer with the name of the community and introduce him/herself?",
            "points": 5
          },
          {
            "id": "Q220",
            "text": "Did the leasing professional determine the preferred floorplan?",
            "points": 5
          },
          {
            "id": "Q230",
            "text": "Did the leasing professional determine preferred move-in date?",
            "points": 5
          },
          {
            "id": "Q240",
            "text": "Did the leasing professional prioritize booking a tour with you over the phone rather than making the call all about amenities, prices and specials?",
            "points": 10
          },
          {
            "id": "Q250",
            "text": "Did the leasing professional ask at least 3 intentional rapport building questions to identify your motivation for moving and desires in your new home?",
            "points": 10
          },
          {
            "id": "Q260",
            "text": "Did the leasing professional use information discovered during rapport building to add value to apartment features and/or community amenities?",
            "points": 10
          },
          {
            "id": "Q270",
            "text": "Did the leasing professional describe apartment features and/or community amenities?",
            "points": 10
          }
        ]
      }
    ]
  }'::jsonb as definition
),
inserted_rubrics as (
  insert into rubrics (
    name,
    definition,
    analysis_model,
    session_type,
    segmentation_prompt,
    analysis_prompt,
    source_url,
    is_default,
    company_id
  )
  select
    'Phone Shop Rubric',
    phone_shop_definition.definition,
    'claude-sonnet-5',
    'phone_shop',
    null,
    null,
    null,
    false,
    company.id
  from admin_companies company
  cross join phone_shop_definition
  where not exists (
    select 1
    from rubrics existing
    where existing.company_id = company.id
      and existing.session_type = 'phone_shop'
      and lower(existing.name) = lower('Phone Shop Rubric')
  )
  returning id, company_id
),
phone_shop_rubrics as (
  select id, company_id from inserted_rubrics
  union
  select id, company_id
  from rubrics
  where session_type = 'phone_shop'
    and lower(name) = lower('Phone Shop Rubric')
    and company_id is not null
)
insert into rubric_communities (rubric_id, property_id)
select rubric.id, property.id
from phone_shop_rubrics rubric
join admin_properties property on property.company_id = rubric.company_id
where property.portal_enabled = true
on conflict do nothing;
